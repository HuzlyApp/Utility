export class ResumeUpdateError extends Error {
  code?: string;
  detectedName?: string;
  existingName?: string;

  constructor(
    message: string,
    code?: string,
    extras?: { detectedName?: string; existingName?: string }
  ) {
    super(message);
    this.name = "ResumeUpdateError";
    this.code = code;
    this.detectedName = extras?.detectedName;
    this.existingName = extras?.existingName;
  }
}

export async function updateResumeAndReanalyze(options: {
  analysisId: string;
  file: File;
  modelOptionId?: string;
  continueNameMismatch?: boolean;
  candidateNameDecision?: "keep" | "replace";
  forceRetry?: boolean;
}): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.set("file", options.file);
  if (options.modelOptionId) form.set("ai_model_option", options.modelOptionId);
  if (options.continueNameMismatch) form.set("continue_name_mismatch", "true");
  if (options.candidateNameDecision) {
    form.set("candidate_name_decision", options.candidateNameDecision);
  }
  if (options.forceRetry) form.set("force_retry", "true");

  const res = await fetch(`/api/candidate-match/${options.analysisId}/update-resume`, {
    method: "POST",
    body: form,
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ResumeUpdateError(
      res.ok
        ? "Unexpected response from server."
        : `Resume update failed (HTTP ${res.status}). Please try again.`,
      "INVALID_RESPONSE"
    );
  }

  if (!res.ok || data.success === false) {
    throw new ResumeUpdateError(String(data.error ?? "Resume update failed."), String(data.code ?? ""), {
      detectedName: typeof data.detected_name === "string" ? data.detected_name : undefined,
      existingName: typeof data.existing_name === "string" ? data.existing_name : undefined,
    });
  }
  return data;
}
