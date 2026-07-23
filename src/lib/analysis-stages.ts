/**
 * Real analysis processing stages (not a fake time-based percentage).
 * Percentages are derived from the current stage; AI work itself is indeterminate.
 */

export const ANALYSIS_PROGRESS_STAGES = [
  "queued",
  "extracting",
  "preparing",
  "analyzing",
  "validating",
  "saving",
  "completed",
  "failed",
] as const;

export type AnalysisProgressStage = (typeof ANALYSIS_PROGRESS_STAGES)[number];

export const STAGE_PROGRESS: Record<AnalysisProgressStage, number> = {
  queued: 5,
  extracting: 25,
  preparing: 40,
  analyzing: 60,
  validating: 80,
  saving: 90,
  completed: 100,
  failed: 0,
};

export const STAGE_LABEL: Record<AnalysisProgressStage, string> = {
  queued: "Queued…",
  extracting: "Extracting résumé content…",
  preparing: "Preparing candidate data…",
  analyzing: "Analyzing with AI…",
  validating: "Validating result…",
  saving: "Saving analysis…",
  completed: "Analysis completed",
  failed: "Analysis failed",
};

export function isTerminalStage(stage: AnalysisProgressStage): boolean {
  return stage === "completed" || stage === "failed";
}

export function progressForStage(stage: AnalysisProgressStage): number {
  return STAGE_PROGRESS[stage];
}

export interface AnalysisProgressEvent {
  stage: AnalysisProgressStage;
  progress: number;
  message: string;
  analysis_id?: string;
  candidate_id?: string;
  overall_match_score?: number;
  match_category?: string;
  submission_readiness?: string;
  recommended_action?: string;
  ai_provider?: string;
  ai_model?: string;
  error?: string;
  code?: string;
}

export function analyzingMessage(modelLabel: string): string {
  return `Analyzing with ${modelLabel}…`;
}
