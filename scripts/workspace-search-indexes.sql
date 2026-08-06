-- Indexes to support job workspace search (title, job code, client, department, location).
-- Safe to re-run. pg_trgm enables efficient ILIKE '%term%' partial matching.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_status_updated
  ON job_match_workspaces (tenant_id, workspace_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_job_ref_trgm
  ON job_match_workspaces USING gin (job_ref gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_job_title_trgm
  ON job_match_workspaces USING gin (job_title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_workspaces_msp_or_client_trgm
  ON job_match_workspaces USING gin (msp_or_client gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_workspaces_department_trgm
  ON job_match_workspaces USING gin (department gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_workspaces_location_trgm
  ON job_match_workspaces USING gin (location gin_trgm_ops);
