import { runAnalysis } from "./ai";
import { validateAndScore } from "./scoring";
import { sanitizeResumeText } from "./sanitize";
import { config } from "./config";
import type { AiResult } from "./schema";
import type { AnalyzeRequestBody } from "./types";

export interface PerformAnalysisResult {
  aiResult: AiResult; // raw (schema-valid) model output
  validatedResult: AiResult; // after deterministic scoring + overrides
  scoreAdjustments: string[];
  rawResponse: string;
  repaired: boolean;
  model: string;
  piiRemoved: string[];
}

/**
 * End-to-end analysis pipeline shared by the analyze and reanalyze routes:
 * sanitize résumé -> call model -> deterministic score/override validation.
 */
export async function performAnalysis(
  input: AnalyzeRequestBody,
  meta?: { analysisId?: string; tenantId?: string; userId?: string }
): Promise<PerformAnalysisResult> {
  const { text: safeResume, removed } = sanitizeResumeText(input.resume_text);

  const ai = await runAnalysis(
    {
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
    model: ai.model,
    piiRemoved: removed,
  };
}
