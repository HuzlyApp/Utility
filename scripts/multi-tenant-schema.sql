-- Multi-tenant foundation migration.
-- Apply after dashboard-schema.sql and before tenant feature rollout.

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

-- Default tenant for legacy rows.
INSERT INTO tenants (name, slug, status, settings_json)
VALUES ('Default Workspace', 'default', 'ACTIVE', '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Extend user_profiles to hold tenant membership + role/status.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Normalize role values for platform + tenant roles.
UPDATE user_profiles
SET role = CASE
  WHEN role = 'ADMIN' THEN 'TENANT_ADMIN'
  WHEN role = 'RECRUITER' THEN 'RECRUITER'
  ELSE role
END
WHERE role IN ('ADMIN', 'RECRUITER');

-- Create default tenant membership for existing users.
UPDATE user_profiles up
SET tenant_id = t.id
FROM tenants t
WHERE t.slug = 'default'
  AND up.tenant_id IS NULL
  AND up.role <> 'SUPER_ADMIN';

-- For tenant-scoped data tables, add UUID tenant FK and backfill from default.
ALTER TABLE job_match_workspaces
  ADD COLUMN IF NOT EXISTS tenant_id_v2 UUID REFERENCES tenants(id);
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS tenant_id_v2 UUID REFERENCES tenants(id);
ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS tenant_id_v2 UUID REFERENCES tenants(id);
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id_v2 UUID REFERENCES tenants(id);
ALTER TABLE job_analysis_cache
  ADD COLUMN IF NOT EXISTS tenant_id_v2 UUID REFERENCES tenants(id);

UPDATE job_match_workspaces w
SET tenant_id_v2 = t.id
FROM tenants t
WHERE t.slug = 'default'
  AND w.tenant_id_v2 IS NULL;

UPDATE candidates c
SET tenant_id_v2 = t.id
FROM tenants t
WHERE t.slug = 'default'
  AND c.tenant_id_v2 IS NULL;

UPDATE candidate_match_analyses a
SET tenant_id_v2 = t.id
FROM tenants t
WHERE t.slug = 'default'
  AND a.tenant_id_v2 IS NULL;

UPDATE audit_logs l
SET tenant_id_v2 = t.id
FROM tenants t
WHERE t.slug = 'default'
  AND l.tenant_id_v2 IS NULL;

UPDATE job_analysis_cache c
SET tenant_id_v2 = t.id
FROM tenants t
WHERE t.slug = 'default'
  AND c.tenant_id_v2 IS NULL;

-- Enforce non-null tenant ownership on tenant-scoped tables.
ALTER TABLE job_match_workspaces ALTER COLUMN tenant_id_v2 SET NOT NULL;
ALTER TABLE candidates ALTER COLUMN tenant_id_v2 SET NOT NULL;
ALTER TABLE candidate_match_analyses ALTER COLUMN tenant_id_v2 SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN tenant_id_v2 SET NOT NULL;
ALTER TABLE job_analysis_cache ALTER COLUMN tenant_id_v2 SET NOT NULL;

-- Switch legacy text tenant_id -> UUID tenant FK.
ALTER TABLE job_match_workspaces DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE candidates DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE candidate_match_analyses DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE job_analysis_cache DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE job_match_workspaces RENAME COLUMN tenant_id_v2 TO tenant_id;
ALTER TABLE candidates RENAME COLUMN tenant_id_v2 TO tenant_id;
ALTER TABLE candidate_match_analyses RENAME COLUMN tenant_id_v2 TO tenant_id;
ALTER TABLE audit_logs RENAME COLUMN tenant_id_v2 TO tenant_id;
ALTER TABLE job_analysis_cache RENAME COLUMN tenant_id_v2 TO tenant_id;

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant ON job_match_workspaces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analyses_tenant_v2 ON candidate_match_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_v2 ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cache_tenant_v2 ON job_analysis_cache(tenant_id);

-- Tenant-scoped uniqueness for emails (platform account has tenant_id null).
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_tenant_email_unique
ON user_profiles (tenant_id, lower(email))
WHERE tenant_id IS NOT NULL AND email IS NOT NULL;
