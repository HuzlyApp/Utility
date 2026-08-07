-- Contact extraction lifecycle v2: stale status, resume-version idempotency, error categories.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS contact_extraction_error_category TEXT,
  ADD COLUMN IF NOT EXISTS contact_extraction_resume_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_extraction_extracted_resume_version INTEGER;

-- Prefer not_started over legacy pending for new rows.
ALTER TABLE candidates
  ALTER COLUMN contact_extraction_status SET DEFAULT 'not_started';

-- Normalize legacy labels to the expanded canonical set.
UPDATE candidates
SET contact_extraction_status = CASE lower(contact_extraction_status)
  WHEN 'not_processed' THEN 'not_started'
  WHEN 'pending' THEN 'not_started'
  WHEN 'extracted' THEN 'completed'
  WHEN 'processing' THEN 'processing'
  WHEN 'queued' THEN 'queued'
  WHEN 'completed' THEN 'completed'
  WHEN 'not_found' THEN 'not_found'
  WHEN 'failed' THEN 'failed'
  WHEN 'stale' THEN 'stale'
  WHEN 'not_started' THEN 'not_started'
  ELSE 'not_started'
END
WHERE contact_extraction_status IS NOT NULL;

-- Convert timed-out failed rows that still look like timeouts into stale (optional clarity).
UPDATE candidates
SET contact_extraction_status = 'stale',
    contact_extraction_error_category = COALESCE(contact_extraction_error_category, 'timeout')
WHERE lower(contact_extraction_status) = 'failed'
  AND contact_extraction_error ILIKE '%timed out%';

-- Stale in-flight jobs (started > 2 minutes ago).
UPDATE candidates
SET
  contact_extraction_status = 'stale',
  contact_extraction_error = COALESCE(
    contact_extraction_error,
    'Contact extraction timed out before completion.'
  ),
  contact_extraction_error_category = COALESCE(contact_extraction_error_category, 'timeout'),
  contact_extraction_completed_at = COALESCE(contact_extraction_completed_at, now())
WHERE lower(contact_extraction_status) IN ('pending', 'not_started', 'processing', 'queued')
  AND contact_extraction_started_at IS NOT NULL
  AND contact_extraction_started_at < now() - interval '2 minutes';

CREATE INDEX IF NOT EXISTS idx_candidates_contact_status_v2
  ON candidates (tenant_id, contact_extraction_status);

CREATE INDEX IF NOT EXISTS idx_candidates_contact_resume_version
  ON candidates (tenant_id, contact_extraction_resume_version);
