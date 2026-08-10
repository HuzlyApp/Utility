-- Candidate CRM: tenant-scoped statuses, notes, assignment, activity history.
-- Apply after multi-tenant-schema.sql. Safe to re-run (IF NOT EXISTS / idempotent seeds).

-- ---------------------------------------------------------------------------
-- Lookup: candidate_statuses (tenant-specific recruiting stages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_statuses_tenant_name
  ON candidate_statuses (tenant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_candidate_statuses_tenant_order
  ON candidate_statuses (tenant_id, display_order);

-- ---------------------------------------------------------------------------
-- Candidate notes (multi-author; soft delete)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  author_user_id UUID,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_candidate_notes_candidate
  ON candidate_notes (tenant_id, candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_notes_author
  ON candidate_notes (author_user_id);

-- ---------------------------------------------------------------------------
-- Candidate activity / history timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID,
  performed_by_user_id UUID,
  action_type TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_candidate
  ON candidate_activity_logs (tenant_id, candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_actor
  ON candidate_activity_logs (performed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_action
  ON candidate_activity_logs (tenant_id, action_type);

-- ---------------------------------------------------------------------------
-- Extend candidates with CRM fields
-- ---------------------------------------------------------------------------
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS current_status_id UUID REFERENCES candidate_statuses(id),
  ADD COLUMN IF NOT EXISTS assigned_recruiter_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS last_status_changed_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_candidates_status
  ON candidates (tenant_id, current_status_id);

CREATE INDEX IF NOT EXISTS idx_candidates_assigned
  ON candidates (tenant_id, assigned_recruiter_id);

CREATE INDEX IF NOT EXISTS idx_candidates_updated_by
  ON candidates (tenant_id, updated_by_user_id);

-- ---------------------------------------------------------------------------
-- Seed default statuses for every tenant (idempotent by unique name)
-- ---------------------------------------------------------------------------
INSERT INTO candidate_statuses (tenant_id, name, color, display_order, is_default, is_active)
SELECT t.id, s.name, s.color, s.display_order, s.is_default, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('New / Not Contacted', '#9ca3af', 10, true),
    ('Attempted Contact', '#7dd3fc', 20, false),
    ('Unreachable', '#d4a574', 30, false),
    ('Initial Screening Complete', '#60a5fa', 40, false),
    ('Qualified-Ready for 2nd Interview', '#c4b5fd', 50, false),
    ('Approved -Upload to Portal', '#94a3b8', 60, false),
    ('Disqualified / Not a Fit', '#fca5a5', 70, false),
    ('Follow-up Needed', '#fbbf24', 80, false),
    ('Candidate Withdrew', '#f9a8d4', 90, false),
    ('Profile Uploaded', '#bae6fd', 100, false),
    ('Candidate selected', '#166534', 110, false),
    ('Candidate Rejected', '#d1d5db', 120, false),
    ('Callback - not available', '#5b21b6', 130, false),
    ('Rejected After 2nd Interview', '#991b1b', 140, false),
    ('Submitted for MSP Review', '#0ea5e9', 160, false),
    ('Approved by MSP', '#059669', 170, false),
    ('Selected by MSP Client', '#166534', 180, false),
    ('Rejected at MSP Screening', '#dc2626', 190, false)
) AS s(name, color, display_order, is_default)
WHERE NOT EXISTS (
  SELECT 1 FROM candidate_statuses cs
  WHERE cs.tenant_id = t.id AND lower(cs.name) = lower(s.name)
);

-- Ensure exactly one default per tenant (prefer "New / Not Contacted").
UPDATE candidate_statuses cs
SET is_default = false
WHERE is_default = true
  AND id NOT IN (
    SELECT DISTINCT ON (tenant_id) id
    FROM candidate_statuses
    WHERE is_default = true OR lower(name) = 'new / not contacted'
    ORDER BY tenant_id,
      CASE WHEN lower(name) = 'new / not contacted' THEN 0 ELSE 1 END,
      display_order
  );

UPDATE candidate_statuses cs
SET is_default = true
WHERE lower(name) = 'new / not contacted'
  AND NOT EXISTS (
    SELECT 1 FROM candidate_statuses x
    WHERE x.tenant_id = cs.tenant_id AND x.is_default = true
  );

-- ---------------------------------------------------------------------------
-- Backfill existing candidates
-- ---------------------------------------------------------------------------
UPDATE candidates c
SET current_status_id = ds.id
FROM candidate_statuses ds
WHERE ds.tenant_id = c.tenant_id
  AND ds.is_default = true
  AND c.current_status_id IS NULL;

UPDATE candidates
SET created_by_user_id = COALESCE(created_by_user_id, created_by, owner_user_id)
WHERE created_by_user_id IS NULL;

-- Migrate legacy free-text recruiter_notes into candidate_notes (no fabricated author).
INSERT INTO candidate_notes (tenant_id, candidate_id, author_user_id, note_text, created_at, updated_at)
SELECT c.tenant_id, c.id, NULL, c.recruiter_notes, c.updated_at, c.updated_at
FROM candidates c
WHERE c.recruiter_notes IS NOT NULL
  AND trim(c.recruiter_notes) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM candidate_notes n
    WHERE n.candidate_id = c.id
      AND n.author_user_id IS NULL
      AND n.note_text = c.recruiter_notes
  );
