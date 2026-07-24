import { analyzeCandidate } from "./ai";
import { validateAndScore } from "./scoring";
import { sanitizeResumeText } from "./sanitize";
import { config } from "./config";
import type { AiResult } from "./schema";
import type { AnalyzeRequestBody } from "./types";
import type { AiModelOptionId, AiProvider } from "./ai";
import { DEFAULT_AI_MODEL_OPTION } from "./ai";

export interface PerformAnalysisOptions {
  analysisId?: string;
  tenantId?: string;
  userId?: string;
  provider?: AiProvider;
  model?: string;
  optionId?: AiModelOptionId;
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
    },
    {
      analysisId: meta?.analysisId,
      tenantId: meta?.tenantId,
      userId: meta?.userId,
    }
  );

  const { result: validatedResult, adjustments } = validateAndScore(ai.aiResult);

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
  };
}
