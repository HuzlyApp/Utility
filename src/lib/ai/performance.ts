/**
 * Performance instrumentation for Claude analysis pipeline.
 * Captures detailed stage timings without logging PII.
 */

export interface AnalysisStageTimings {
  promptBuildMs: number;
  claudeTimeToFirstTokenMs: number | null;
  claudeGenerationMs: number;
  jsonParseMs: number;
  validationMs: number;
  repairRetryMs: number;
  scoringMs: number;
  persistenceMs: number;
  clientRenderMs: number | null;
}

export interface PerformanceMetrics {
  analysisId?: string;
  provider: string;
  model: string;
  totalDurationMs: number;
  stages: AnalysisStageTimings;
  jobChars: number;
  resumeChars: number;
  inputTokens?: number;
  outputTokens?: number;
  repairAttempted: boolean;
  repairSucceeded: boolean;
  validationErrorCategory?: string;
}

export class PerformanceTimer {
  private startTime: number;
  private marks = new Map<string, number>();

  constructor() {
    this.startTime = performance.now();
  }

  /** Record a mark at the current time. */
  mark(label: string): number {
    const now = performance.now();
    this.marks.set(label, now);
    return now - this.startTime;
  }

  /** Alias for mark - records the start of a stage. */
  start(label: string): void {
    this.mark(label);
  }

  /** Alias for mark - records the end of a stage. */
  end(label: string): void {
    this.mark(`${label}_end`);
  }

  /** Get duration between start and end marks. */
  getDuration(startLabel: string, endLabel?: string): number {
    const start = this.marks.get(startLabel);
    if (!start) return 0;
    const end = endLabel ? this.marks.get(endLabel) : performance.now();
    return end ? end - start : 0;
  }

  /** Alias for getDuration. */
  duration(label: string): number {
    return this.getDuration(label, `${label}_end`);
  }

  /** Get total elapsed time. */
  getTotalDuration(): number {
    return performance.now() - this.startTime;
  }

  /** Alias for getTotalDuration. */
  total(): number {
    return this.getTotalDuration();
  }

  getMark(label: string): number | undefined {
    return this.marks.get(label);
  }
}

export class AnalysisPerformanceTracker {
  private timer: PerformanceTimer;
  private metrics: Partial<PerformanceMetrics> = {};
  private stageTimings: Partial<AnalysisStageTimings> = {};

  constructor(provider: string, model: string, analysisId?: string) {
    this.timer = new PerformanceTimer();
    this.metrics.provider = provider;
    this.metrics.model = model;
    this.metrics.analysisId = analysisId;
  }

  markPromptBuilt(jobChars: number, resumeChars: number): void {
    this.stageTimings.promptBuildMs = Math.round(this.timer.mark("prompt_built"));
    this.metrics.jobChars = jobChars;
    this.metrics.resumeChars = resumeChars;
  }

  markClaudeRequestStarted(): void {
    this.timer.mark("claude_request_started");
  }

  markClaudeFirstToken(): void {
    this.timer.mark("claude_first_token");
    this.stageTimings.claudeTimeToFirstTokenMs = Math.round(
      this.timer.getDuration("claude_request_started", "claude_first_token")
    );
  }

  markClaudeComplete(inputTokens?: number, outputTokens?: number): void {
    this.timer.mark("claude_complete");
    this.stageTimings.claudeGenerationMs = Math.round(
      this.timer.getDuration("claude_request_started", "claude_complete")
    );
    if (inputTokens !== undefined) this.metrics.inputTokens = inputTokens;
    if (outputTokens !== undefined) this.metrics.outputTokens = outputTokens;
  }

  markJsonParsed(): void {
    this.timer.mark("json_parsed");
    this.stageTimings.jsonParseMs = Math.round(
      this.timer.getDuration("claude_complete", "json_parsed")
    );
  }

  markValidated(): void {
    this.timer.mark("validated");
    this.stageTimings.validationMs = Math.round(
      this.timer.getDuration("json_parsed", "validated")
    );
  }

  markRepairStarted(): void {
    this.timer.mark("repair_started");
  }

  markRepairComplete(success: boolean): void {
    this.timer.mark("repair_complete");
    this.stageTimings.repairRetryMs = Math.round(
      this.timer.getDuration("repair_started", "repair_complete")
    );
    this.metrics.repairAttempted = true;
    this.metrics.repairSucceeded = success;
  }

  markScoringComplete(): void {
    this.timer.mark("scoring_complete");
    this.stageTimings.scoringMs = Math.round(
      this.timer.getDuration("validated", "scoring_complete")
    );
  }

  markPersistenceComplete(): void {
    this.timer.mark("persistence_complete");
    this.stageTimings.persistenceMs = Math.round(
      this.timer.getDuration("scoring_complete", "persistence_complete")
    );
  }

  setValidationErrorCategory(category: string): void {
    this.metrics.validationErrorCategory = category;
  }

  getMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      totalDurationMs: Math.round(this.timer.getTotalDuration()),
      stages: {
        promptBuildMs: this.stageTimings.promptBuildMs ?? 0,
        claudeTimeToFirstTokenMs: this.stageTimings.claudeTimeToFirstTokenMs ?? null,
        claudeGenerationMs: this.stageTimings.claudeGenerationMs ?? 0,
        jsonParseMs: this.stageTimings.jsonParseMs ?? 0,
        validationMs: this.stageTimings.validationMs ?? 0,
        repairRetryMs: this.stageTimings.repairRetryMs ?? 0,
        scoringMs: this.stageTimings.scoringMs ?? 0,
        persistenceMs: this.stageTimings.persistenceMs ?? 0,
        clientRenderMs: null, // Set by client if needed
      },
      repairAttempted: this.metrics.repairAttempted ?? false,
      repairSucceeded: this.metrics.repairSucceeded ?? false,
    } as PerformanceMetrics;
  }
}

/**
 * Safely logs performance metrics without PII.
 * Never logs resume text, job description, prompts, or API responses.
 */
/** @deprecated Use AnalysisPerformanceMetrics from types.ts */
export type PerformanceReport = import("./types").AnalysisPerformanceMetrics;

export function logPerformanceMetrics(metrics: PerformanceMetrics): void {
  // eslint-disable-next-line no-console
  console.log(
    `[candidate_match_analysis_performance]`,
    JSON.stringify({
      event: "candidate_match_analysis_performance",
      analysis_id: metrics.analysisId,
      provider: metrics.provider,
      model: metrics.model,
      total_duration_ms: metrics.totalDurationMs,
      stages: {
        prompt_build_ms: metrics.stages.promptBuildMs,
        claude_time_to_first_token_ms: metrics.stages.claudeTimeToFirstTokenMs,
        claude_generation_ms: metrics.stages.claudeGenerationMs,
        json_parse_ms: metrics.stages.jsonParseMs,
        validation_ms: metrics.stages.validationMs,
        repair_retry_ms: metrics.stages.repairRetryMs,
        scoring_ms: metrics.stages.scoringMs,
        persistence_ms: metrics.stages.persistenceMs,
        client_render_ms: metrics.stages.clientRenderMs,
      },
      job_chars: metrics.jobChars,
      resume_chars: metrics.resumeChars,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      repair_attempted: metrics.repairAttempted,
      repair_succeeded: metrics.repairSucceeded,
      validation_error_category: metrics.validationErrorCategory,
    })
  );
}

/**
 * Categorizes validation errors for telemetry without logging the actual error content.
 * Returns a simple string category.
 */
export function categorizeValidationError(error: string): string {
  if (error.includes("Required")) return "missing_required_field";
  if (error.includes("enum")) return "invalid_enum_value";
  if (error.includes("number")) return "invalid_number";
  if (error.includes("boolean")) return "invalid_boolean";
  if (error.includes("array")) return "invalid_array";
  if (error.includes("CONFIRMED") && error.includes("candidate_evidence")) {
    return "missing_confirmed_evidence";
  }
  if (error.includes("JSON")) return "invalid_json";
  return "unknown_validation_error";
}
