import { analyzeCandidate } from "./ai";
import { validateAndScore } from "./scoring";
import { sanitizeResumeText } from "./sanitize";
import { config } from "./config";
import { PerformanceTimer } from "./ai/performance";
import { getJobRequirementsCache } from "./ai/job-cache";
import type { AiResult } from "./schema";
import type { AnalyzeRequestBody, AnalysisMode } from "./types";
import { DEFAULT_ANALYSIS_MODE, resolveAnalysisMode } from "./types";
import type { AiModelOptionId, AiProvider } from "./ai";
import { DEFAULT_AI_MODEL_OPTION } from "./ai";

export interface PerformAnalysisOptions {
  analysisId?: string;
  tenantId?: string;
  userId?: string;
  provider?: AiProvider;
  model?: string;
  optionId?: AiModelOptionId;
  analysisMode?: AnalysisMode;
}

export interface PerformAnalysisResult {
  aiResult: AiResult; // raw (schema-valid) model output
  validatedResult: AiResult; // after deterministic scoring + overrides
  scoreAdjustments: string[];
  rawResponse: string;
  repaired: boolean;
  provider: AiProvider;
  model: string;
  optionId: AiModelOptionId;
  piiRemoved: string[];
  perf?: import("./ai/types").AnalysisPerformanceMetrics;
  jobCacheHit?: boolean;
}

/**
 * End-to-end analysis pipeline shared by the analyze and reanalyze routes:
 * sanitize résumé -> call selected provider -> deterministic score/override validation.
 */
export async function performAnalysis(
  input: AnalyzeRequestBody,
  meta?: PerformAnalysisOptions
): Promise<PerformAnalysisResult> {
  const { text: safeResume, removed } = sanitizeResumeText(input.resume_text);
  // Grok analysis is disabled — match analysis always uses Claude.
  const provider: AiProvider = "claude";
  const optionId = meta?.optionId ?? DEFAULT_AI_MODEL_OPTION;
  const analysisMode = resolveAnalysisMode(
    meta?.analysisMode ?? input.analysis_mode ?? DEFAULT_ANALYSIS_MODE
  );

  // Fetch or build cached job requirements to reduce prompt size for repeat jobs.
  const { cached: jobCache, hit: jobCacheHit } = await getJobRequirementsCache({
    jobText: input.job_description_text,
    structured: input.structured_job_fields,
    tenantId: meta?.tenantId,
    modelUsed: meta?.model ?? config.claudeModel,
  });

  const ai = await analyzeCandidate(
    {
      provider,
      model:
        meta?.model && !/grok/i.test(meta.model) ? meta.model : undefined,
      optionId,
      job_id: input.job_id,
      job_title: input.job_title,
      msp_name: input.msp_name,
      structured_job_fields: input.structured_job_fields,
      job_description_text: input.job_description_text,
      resume_text: safeResume,
      verified_recruiter_inputs: input.verified_recruiter_inputs,
      recruiter_notes: input.recruiter_notes,
      recent_experience_months: config.recentExperienceMonths,
      cached_job_requirements: jobCache,
      analysisMode,
    },
    {
      analysisId: meta?.analysisId,
      tenantId: meta?.tenantId,
      userId: meta?.userId,
    }
  );

  const timer = new PerformanceTimer();
  timer.start("scoring");
  const { result: validatedResult, adjustments } = validateAndScore(
    ai.aiResult,
    { preserveAdvisoryOverallScore: analysisMode === "analyze" }
  );
  timer.end("scoring");

  // Merge AI provider timings with application-side timings.
  const basePerf = ai.perf;
  const perf: import("./ai/types").AnalysisPerformanceMetrics = basePerf
    ? {
        ...basePerf,
        scoring_ms: timer.duration("scoring"),
        total_duration_ms:
          basePerf.total_duration_ms + timer.duration("scoring"),
      }
    : {
        prompt_build_ms: 0,
        claude_time_to_first_token_ms: 0,
        claude_generation_ms: 0,
        json_parse_ms: 0,
        validation_ms: 0,
        repair_retry_ms: 0,
        scoring_ms: timer.duration("scoring"),
        persistence_ms: 0,
        client_render_ms: 0,
        total_duration_ms: timer.duration("scoring"),
      };

  return {
    aiResult: ai.aiResult,
    validatedResult,
    scoreAdjustments: adjustments,
    rawResponse: ai.rawResponse,
    repaired: ai.repaired,
    provider: ai.provider,
    model: ai.model,
    optionId: ai.optionId,
    piiRemoved: removed,
    perf,
    jobCacheHit,
  };
}
