-- Recruiter Activity CRM: extend candidate_activity_logs for productivity tracking.
-- Apply after candidate-crm-schema.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Extend activity log columns
-- ---------------------------------------------------------------------------
ALTER TABLE candidate_activity_logs
  ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE candidate_activity_logs
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'recruiter',
  ADD COLUMN IF NOT EXISTS analysis_id UUID,
  ADD COLUMN IF NOT EXISTS note_id UUID,
  ADD COLUMN IF NOT EXISTS action_label TEXT;

-- Idempotency: one activity event per (tenant, request_id).
-- Multiple NULL request_id values are allowed (PostgreSQL UNIQUE nulls).
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_activity_request_id
  ON candidate_activity_logs (tenant_id, request_id);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_tenant_created
  ON candidate_activity_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_recruiter_created
  ON candidate_activity_logs (performed_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_job
  ON candidate_activity_logs (job_id)
  WHERE job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Naming-alignment view (single source of truth remains candidate_activity_logs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW recruiter_activity_logs AS
SELECT
  id,
  tenant_id,
  performed_by_user_id AS recruiter_user_id,
  candidate_id,
  job_id,
  analysis_id,
  note_id,
  action_type AS activity_type,
  action_label,
  previous_value,
  new_value,
  metadata,
  source,
  request_id,
  created_at
FROM candidate_activity_logs;

-- ---------------------------------------------------------------------------
-- Tenant settings_json keys (documented; defaults applied in application code):
-- {
--   "timezone": "UTC",
--   "productivityScore": {
--     "enabled": true,
--     "weights": {
--       "candidatesWorked": 0.20,
--       "analysesCompleted": 0.15,
--       "notesAndFollowUps": 0.15,
--       "statusProgression": 0.20,
--       "candidatesSubmitted": 0.15,
--       "interviewsOffersHires": 0.15
--     }
--   },
--   "successfulStatusNames": [
--     "Qualified-Ready for 2nd Interview",
--     "Approved -Upload to Portal",
--     "Candidate selected"
--   ],
--   "inactivityThresholds": {
--     "hours24": 24,
--     "days3": 72,
--     "days7": 168,
--     "staleStatusDays": 7
--   }
-- }
-- ---------------------------------------------------------------------------
