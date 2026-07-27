-- Duplicate candidate detection fields (tenant-scoped name search + audit).

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS normalized_full_name TEXT;

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS candidate_name TEXT,
  ADD COLUMN IF NOT EXISTS normalized_candidate_name TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_warning_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS duplicate_confidence TEXT;

-- Backfill normalized names for existing candidates.
UPDATE candidates
SET normalized_full_name = lower(
  trim(
    regexp_replace(
      regexp_replace(coalesce(full_name, ''), '[^[:alnum:][:space:]]', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  )
)
WHERE normalized_full_name IS NULL AND full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_tenant_normalized_name
  ON candidates (tenant_id, normalized_full_name)
  WHERE normalized_full_name IS NOT NULL AND normalized_full_name != '';

CREATE INDEX IF NOT EXISTS idx_candidate_match_duplicate_name
  ON candidate_match_analyses (tenant_id, normalized_candidate_name)
  WHERE normalized_candidate_name IS NOT NULL;
