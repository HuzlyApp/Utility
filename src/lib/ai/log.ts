import type { AnalysisCallMeta, AnalysisPerformanceMetrics } from "./types";

/** Safe operational logging — never logs resume/job content or secrets. */
export function logAnalysisOperation(
  operation: string,
  meta: AnalysisCallMeta,
  details?: Record<string, unknown>
) {
  // eslint-disable-next-line no-console
  console.log(
    `[ai-analysis] ${operation}`,
    JSON.stringify({
      analysisId: meta.analysisId,
      tenantId: meta.tenantId,
      userId: meta.userId,
      provider: meta.provider,
      model: meta.model,
      inputChars: meta.inputCharCount,
      resumeChars: meta.resumeCharCount,
      jobChars: meta.jobCharCount,
      ...details,
    })
  );
}

/**
 * Log granular performance metrics for the Claude analysis pipeline.
 * Never includes PII, resume text, job text, or prompts.
 */
export function logPerformance(
  meta: AnalysisCallMeta,
  perf: AnalysisPerformanceMetrics,
  extra: {
    job_chars?: number;
    resume_chars?: number;
    input_tokens?: number;
    output_tokens?: number;
    repair_attempted?: boolean;
  }
) {
  // eslint-disable-next-line no-console
  console.log(
    `[ai-analysis] candidate_match_analysis_performance`,
    JSON.stringify({
      event: "candidate_match_analysis_performance",
      analysis_id: meta.analysisId,
      provider: meta.provider,
      model: meta.model,
      total_duration_ms: perf.total_duration_ms,
      stages: {
        prompt_build_ms: perf.prompt_build_ms,
        claude_time_to_first_token_ms: perf.claude_time_to_first_token_ms,
        claude_generation_ms: perf.claude_generation_ms,
        json_parse_ms: perf.json_parse_ms,
        validation_ms: perf.validation_ms,
        repair_retry_ms: perf.repair_retry_ms,
        scoring_ms: perf.scoring_ms,
        persistence_ms: perf.persistence_ms,
        client_render_ms: perf.client_render_ms,
      },
      job_chars: extra.job_chars,
      resume_chars: extra.resume_chars,
      input_tokens: extra.input_tokens,
      output_tokens: extra.output_tokens,
      repair_attempted: extra.repair_attempted ?? false,
    })
  );
}
