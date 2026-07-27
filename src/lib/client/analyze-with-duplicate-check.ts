import {
  analyzeCandidateStream,
  AnalyzeRequestError,
  type AnalyzeStreamResult,
} from "@/lib/client/analyze-candidate";
import type { AnalysisProgressEvent } from "@/lib/analysis-stages";
import type { DuplicateConfirmationRequired } from "@/lib/duplicate-candidate/messages";

export class DuplicateConfirmationNeededError extends Error {
  readonly duplicate: DuplicateConfirmationRequired;

  constructor(duplicate: DuplicateConfirmationRequired) {
    super("Duplicate confirmation required.");
    this.name = "DuplicateConfirmationNeededError";
    this.duplicate = duplicate;
  }
}

/**
 * Runs workspace candidate analysis. Throws DuplicateConfirmationNeededError
 * when the server requires recruiter acknowledgement before calling Claude.
 */
export async function analyzeCandidateWithDuplicateCheck(options: {
  workspaceId: string;
  candidateId: string;
  body: Record<string, unknown>;
  onProgress?: (event: AnalysisProgressEvent) => void;
  signal?: AbortSignal;
  duplicateConfirmation?: {
    token: string;
  };
}): Promise<AnalyzeStreamResult> {
  const body: Record<string, unknown> = { ...options.body };

  if (options.duplicateConfirmation) {
    body.continue_after_duplicate_warning = true;
    body.duplicate_confirmation_token = options.duplicateConfirmation.token;
  }

  try {
    return await analyzeCandidateStream({
      workspaceId: options.workspaceId,
      candidateId: options.candidateId,
      body,
      onProgress: options.onProgress,
      signal: options.signal,
    });
  } catch (err) {
    if (
      err instanceof AnalyzeRequestError &&
      err.duplicateConfirmation
    ) {
      throw new DuplicateConfirmationNeededError(err.duplicateConfirmation);
    }
    throw err;
  }
}

export { AnalyzeRequestError };
