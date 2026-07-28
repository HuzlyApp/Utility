-- Resume update + in-place reanalysis schema extensions.

ALTER TABLE candidate_match_analyses
  ADD COLUMN IF NOT EXISTS resume_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resume_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_updated_by UUID,
  ADD COLUMN IF NOT EXISTS resume_filename TEXT,
  ADD COLUMN IF NOT EXISTS resume_file_hash TEXT;

CREATE TABLE IF NOT EXISTS candidate_match_analysis_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES candidate_match_analyses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  resume_filename TEXT,
  resume_file_url TEXT,
  resume_file_hash TEXT,
  resume_text TEXT,
  ai_raw_response_json JSONB,
  validated_result_json JSONB,
  overall_match_score INTEGER,
  match_category TEXT,
  recommended_action TEXT,
  submission_readiness TEXT,
  confidence_score INTEGER,
  model_name TEXT,
  change_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, version_number)
);

CREATE TABLE IF NOT EXISTS candidate_match_requirement_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES candidate_match_analyses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  requirement_text TEXT,
  requirement_type TEXT,
  evidence_status TEXT,
  requirement_outcome TEXT,
  candidate_evidence TEXT,
  evidence_source TEXT,
  impact TEXT,
  verification_required BOOLEAN,
  confidence INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_versions_analysis
  ON candidate_match_analysis_versions(analysis_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_requirement_versions_analysis
  ON candidate_match_requirement_versions(analysis_id, version_number DESC);
