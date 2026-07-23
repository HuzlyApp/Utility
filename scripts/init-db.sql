-- Database initialization script for Candidate Match Analyzer
-- Run this to create the required tables on Neon Postgres

-- Main analysis table
CREATE TABLE IF NOT EXISTS candidate_match_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT DEFAULT 'default',
  job_id TEXT,
  recruiter_id TEXT,
  job_title TEXT,
  msp_name TEXT,
  job_description_text TEXT,
  structured_job_fields_json JSONB,
  resume_text TEXT,
  verified_recruiter_inputs_json JSONB,
  recruiter_notes TEXT,
  ai_raw_response_json JSONB,
  validated_result_json JSONB,
  overall_match_score INTEGER,
  match_category TEXT,
  recommended_action TEXT,
  submission_readiness TEXT,
  confidence_score INTEGER,
  recruiter_disposition TEXT,
  recruiter_disposition_notes TEXT,
  analysis_version TEXT DEFAULT '1.0',
  model_name TEXT,
  ai_provider TEXT,
  ai_model TEXT,
  analysis_status TEXT,
  analysis_error TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Requirements evidence table
CREATE TABLE IF NOT EXISTS candidate_match_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES candidate_match_analyses(id) ON DELETE CASCADE,
  requirement_text TEXT,
  requirement_type TEXT,
  evidence_status TEXT,
  requirement_outcome TEXT,
  candidate_evidence TEXT,
  evidence_source TEXT,
  impact TEXT,
  verification_required BOOLEAN,
  recruiter_verified BOOLEAN,
  recruiter_verification_note TEXT,
  confidence INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log table
CREATE TABLE IF NOT EXISTS candidate_match_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES candidate_match_analyses(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  action TEXT,
  previous_value_json JSONB,
  new_value_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analyses_tenant ON candidate_match_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analyses_job ON candidate_match_analyses(job_id);
CREATE INDEX IF NOT EXISTS idx_analyses_recruiter ON candidate_match_analyses(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON candidate_match_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requirements_analysis ON candidate_match_requirements(analysis_id);
CREATE INDEX IF NOT EXISTS idx_audit_analysis ON candidate_match_audit_logs(analysis_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON candidate_match_audit_logs(created_at DESC);

-- Row Level Security (optional - enable if needed)
-- ALTER TABLE candidate_match_analyses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE candidate_match_requirements ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE candidate_match_audit_logs ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (uncomment if using RLS)
-- CREATE POLICY tenant_isolation ON candidate_match_analyses
--   USING (tenant_id = current_setting('app.current_tenant')::TEXT);

-- CREATE POLICY analysis_access ON candidate_match_requirements
--   USING (analysis_id IN (
--     SELECT id FROM candidate_match_analyses 
--     WHERE tenant_id = current_setting('app.current_tenant')::TEXT
--   ));
