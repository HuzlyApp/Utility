-- Persistent Candidate Match Dashboard schema (spec §12/§13).
-- Auth data lives in the Neon Auth (Better Auth) `neon_auth` schema and is NOT
-- duplicated here. These tables only reference the Neon Auth user id.

-- App-side profile linked to a Neon Auth user. Never stores passwords.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'RECRUITER',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One job workspace = one reusable job description (spec §2/§4/§6).
CREATE TABLE IF NOT EXISTS job_match_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  job_ref TEXT,
  job_title TEXT,
  msp_or_client TEXT,
  specialty TEXT,
  department TEXT,
  location TEXT,
  shift TEXT,
  start_date TEXT,
  job_status TEXT NOT NULL DEFAULT 'OPEN',
  workspace_status TEXT NOT NULL DEFAULT 'ACTIVE',
  structured_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_description_text TEXT,
  job_description_quality TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidate records (independent of any single job) (spec §8).
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  full_name TEXT,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  location TEXT,
  extracted_resume_text TEXT,
  ocr_confidence INTEGER,
  extraction_quality TEXT,
  recruiter_notes TEXT,
  verified_information JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unified secure file storage for job descriptions AND candidate resumes.
-- Original bytes are preserved in-DB (bytea); storage_path is a logical, never
-- publicly-exposed reference. OCR text/confidence are stored separately (spec §5).
CREATE TABLE IF NOT EXISTS entity_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,            -- 'job_workspace' | 'candidate'
  entity_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  storage_path TEXT,
  file_bytes BYTEA,
  is_image BOOLEAN NOT NULL DEFAULT false,
  page_order INTEGER NOT NULL DEFAULT 0,
  extracted_text TEXT,
  extraction_method TEXT,
  extraction_quality TEXT,
  ocr_confidence INTEGER,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Convenience views matching the spec's suggested table names.
CREATE OR REPLACE VIEW job_workspace_files AS
  SELECT * FROM entity_files WHERE entity_type = 'job_workspace';
CREATE OR REPLACE VIEW candidate_resume_files AS
  SELECT * FROM entity_files WHERE entity_type = 'candidate';

-- Candidate <-> job relationship, with per-job pipeline status (spec §7/§13).
CREATE TABLE IF NOT EXISTS job_match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES job_match_workspaces(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  latest_analysis_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, candidate_id)
);

-- Extend the existing analyses table to link workspace/candidate + ownership.
ALTER TABLE candidate_match_analyses ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE candidate_match_analyses ADD COLUMN IF NOT EXISTS candidate_id UUID;
ALTER TABLE candidate_match_analyses ADD COLUMN IF NOT EXISTS job_match_candidate_id UUID;
ALTER TABLE candidate_match_analyses ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE candidate_match_analyses ADD COLUMN IF NOT EXISTS owner_user_id UUID;
ALTER TABLE candidate_match_analyses ADD COLUMN IF NOT EXISTS score_adjustments_json JSONB;
-- Ensure candidate_id is UUID (older revisions may have created it as TEXT).
ALTER TABLE candidate_match_analyses
  ALTER COLUMN candidate_id TYPE UUID USING NULLIF(candidate_id::text, '')::uuid;

-- Screening questions + recruiter-recorded answers (spec §11/§13).
CREATE TABLE IF NOT EXISTS candidate_screening_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES job_match_workspaces(id) ON DELETE CASCADE,
  analysis_id UUID,
  owner_user_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  related_requirement TEXT,
  priority INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recruiter dispositions kept SEPARATE from the AI recommendation (spec §11).
CREATE TABLE IF NOT EXISTS recruiter_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES job_match_workspaces(id) ON DELETE CASCADE,
  analysis_id UUID,
  owner_user_id UUID NOT NULL,
  disposition TEXT NOT NULL,
  notes TEXT,
  decided_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- General audit trail scoped by user/tenant (spec §12/§14).
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  entity_type TEXT,
  entity_id UUID,
  action TEXT NOT NULL,
  previous_value_json JSONB,
  new_value_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON job_match_workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON job_match_workspaces(workspace_status);
CREATE INDEX IF NOT EXISTS idx_candidates_owner ON candidates(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_entity_files_entity ON entity_files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_files_owner ON entity_files(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_jmc_workspace ON job_match_candidates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jmc_candidate ON job_match_candidates(candidate_id);
CREATE INDEX IF NOT EXISTS idx_analyses_workspace ON candidate_match_analyses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_analyses_candidate ON candidate_match_analyses(candidate_id);
CREATE INDEX IF NOT EXISTS idx_analyses_owner ON candidate_match_analyses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_screening_candidate ON candidate_screening_answers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_dispositions_candidate ON recruiter_dispositions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
