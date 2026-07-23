-- AI model selection columns for candidate_match_analyses.
-- Safe to re-run; preserves existing Grok-only rows.

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS ai_provider TEXT;

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS ai_model TEXT;

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS analysis_status TEXT;

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS analysis_error TEXT;

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Backfill from legacy model_name / created_at so older Grok analyses keep working.
UPDATE candidate_match_analyses
SET
  ai_provider = COALESCE(ai_provider, 'grok'),
  ai_model = COALESCE(ai_model, model_name, 'grok-4.5'),
  analysis_status = COALESCE(analysis_status, 'completed'),
  analyzed_at = COALESCE(analyzed_at, created_at)
WHERE ai_provider IS NULL
   OR ai_model IS NULL
   OR analysis_status IS NULL
   OR analyzed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_ai_provider
  ON candidate_match_analyses(ai_provider);

CREATE INDEX IF NOT EXISTS idx_analyses_analysis_status
  ON candidate_match_analyses(analysis_status);
