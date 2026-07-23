import type { AnalysisCallMeta } from "./types";

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
