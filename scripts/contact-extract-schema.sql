-- Contact extraction provenance, lifecycle, and stale-job recovery fields.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT,
  ADD COLUMN IF NOT EXISTS email_source TEXT,
  ADD COLUMN IF NOT EXISTS phone_source TEXT,
  ADD COLUMN IF NOT EXISTS contact_extraction_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS contact_extracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_extraction_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_extraction_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_extraction_error TEXT,
  ADD COLUMN IF NOT EXISTS contact_extraction_attempts INTEGER NOT NULL DEFAULT 0;

-- Ensure default is pending for new rows (legacy installs used NOT_PROCESSED).
ALTER TABLE candidates
  ALTER COLUMN contact_extraction_status SET DEFAULT 'pending';

-- Normalize legacy status labels to the canonical set.
UPDATE candidates
SET contact_extraction_status = CASE lower(contact_extraction_status)
  WHEN 'not_processed' THEN 'pending'
  WHEN 'extracted' THEN 'completed'
  WHEN 'processing' THEN 'processing'
  WHEN 'pending' THEN 'pending'
  WHEN 'completed' THEN 'completed'
  WHEN 'not_found' THEN 'not_found'
  WHEN 'failed' THEN 'failed'
  ELSE 'pending'
END
WHERE contact_extraction_status IS NOT NULL;

-- Existing rows that already have contact values are completed.
UPDATE candidates
SET
  contact_extraction_status = 'completed',
  contact_extraction_completed_at = COALESCE(
    contact_extraction_completed_at,
    contact_extracted_at,
    now()
  )
WHERE contact_extraction_status IN ('pending', 'processing')
  AND (
    NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(phone, '')), '') IS NOT NULL
  );

-- Existing rows with no résumé text and no contacts are not_found (not "Extracting…").
UPDATE candidates
SET
  contact_extraction_status = 'not_found',
  contact_extraction_completed_at = COALESCE(contact_extraction_completed_at, now())
WHERE contact_extraction_status IN ('pending', 'processing')
  AND NULLIF(BTRIM(COALESCE(extracted_resume_text, '')), '') IS NULL
  AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NULL
  AND NULLIF(BTRIM(COALESCE(phone, '')), '') IS NULL;

-- Stale in-flight jobs (started > 2 minutes ago) become failed.
UPDATE candidates
SET
  contact_extraction_status = 'failed',
  contact_extraction_error = COALESCE(
    contact_extraction_error,
    'Contact extraction timed out before completion.'
  ),
  contact_extraction_completed_at = COALESCE(contact_extraction_completed_at, now())
WHERE contact_extraction_status IN ('pending', 'processing')
  AND contact_extraction_started_at IS NOT NULL
  AND contact_extraction_started_at < now() - interval '2 minutes';

CREATE INDEX IF NOT EXISTS idx_candidates_email_normalized
  ON candidates (tenant_id, email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_phone_normalized
  ON candidates (tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_contact_status
  ON candidates (tenant_id, contact_extraction_status);

CREATE INDEX IF NOT EXISTS idx_candidates_contact_started
  ON candidates (tenant_id, contact_extraction_started_at)
  WHERE contact_extraction_status IN ('pending', 'processing');
