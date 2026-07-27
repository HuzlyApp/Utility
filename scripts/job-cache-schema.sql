-- Job Analysis Cache Schema
-- Caches normalized job requirements to avoid re-analyzing the same job for each candidate
-- Run this to add the cache table on Neon Postgres

-- Job analysis cache table for reusable job requirement extraction
CREATE TABLE IF NOT EXISTS job_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  -- Content-based cache key (SHA-256 hash of normalized job content)
  content_hash TEXT NOT NULL UNIQUE,
  -- Source identifiers
  workspace_id TEXT,
  job_id TEXT,
  job_title TEXT,
  msp_name TEXT,
  -- Cached normalized requirements
  mandatory_requirements JSONB DEFAULT '[]'::jsonb,
  preferred_requirements JSONB DEFAULT '[]'::jsonb,
  required_licenses JSONB DEFAULT '[]'::jsonb,
  required_certifications JSONB DEFAULT '[]'::jsonb,
  required_years_experience NUMERIC,
  specialty_requirements JSONB DEFAULT '[]'::jsonb,
  location_constraints JSONB DEFAULT '{}'::jsonb,
  education_requirements JSONB DEFAULT '[]'::jsonb,
  requirement_weights JSONB DEFAULT '{}'::jsonb,
  -- Cache metadata
  model_used TEXT,
  cache_version INTEGER DEFAULT 1,
  source_content_length INTEGER,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Analysis performance metrics for monitoring and optimization
CREATE TABLE IF NOT EXISTS analysis_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT,
  tenant_id TEXT DEFAULT 'default',
  -- Provider and model info
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  -- Stage timings in milliseconds
  prompt_build_ms INTEGER,
  claude_time_to_first_token_ms INTEGER,
  claude_generation_ms INTEGER,
  json_parse_ms INTEGER,
  validation_ms INTEGER,
  repair_retry_ms INTEGER,
  scoring_ms INTEGER,
  persistence_ms INTEGER,
  total_duration_ms INTEGER NOT NULL,
  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,
  -- Content sizes (character counts, not content)
  job_chars INTEGER,
  resume_chars INTEGER,
  prompt_chars INTEGER,
  -- Repair tracking
  repair_attempted BOOLEAN DEFAULT FALSE,
  repair_successful BOOLEAN DEFAULT FALSE,
  validation_error_category TEXT,
  -- Outcome
  match_category TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- In-flight analysis tracking for duplicate request prevention
CREATE TABLE IF NOT EXISTS analysis_in_flight (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Request identification
  idempotency_key TEXT NOT NULL UNIQUE,
  workspace_id TEXT,
  candidate_id TEXT,
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ANALYZING, VALIDATING, SCORING, SAVING, COMPLETE, FAILED
  -- Result reference (if complete)
  analysis_id TEXT,
  -- Timeout protection
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  -- Metadata
  tenant_id TEXT DEFAULT 'default',
  user_id TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_cache_content_hash ON job_analysis_cache(content_hash);
CREATE INDEX IF NOT EXISTS idx_job_cache_workspace ON job_analysis_cache(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_cache_tenant ON job_analysis_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cache_expires ON job_analysis_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_analysis ON analysis_performance_metrics(analysis_id);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_created ON analysis_performance_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_provider ON analysis_performance_metrics(provider, model);
CREATE INDEX IF NOT EXISTS idx_in_flight_key ON analysis_in_flight(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_in_flight_expires ON analysis_in_flight(expires_at);

-- Cleanup expired cache entries and stale in-flight records
CREATE OR REPLACE FUNCTION cleanup_stale_analysis_records()
RETURNS void AS $$
BEGIN
  -- Remove expired cache entries
  DELETE FROM job_analysis_cache WHERE expires_at < NOW();
  
  -- Remove stale in-flight records (older than 10 minutes)
  DELETE FROM analysis_in_flight WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Schedule cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-analysis-cache', '0 2 * * *', 'SELECT cleanup_stale_analysis_records()');
