-- Indexes for Candidates page free-text search (name, contact, job code/title).
-- Safe to re-run. pg_trgm enables efficient ILIKE '%term%' partial matching.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_candidates_tenant_full_name_trgm
  ON candidates USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_tenant_normalized_name_trgm
  ON candidates USING gin (normalized_full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_email_trgm
  ON candidates USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_phone_normalized
  ON candidates (tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_tenant_updated
  ON candidates (tenant_id, updated_at DESC);
