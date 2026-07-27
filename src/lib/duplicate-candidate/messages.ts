import type { DuplicateConfidence } from "@/lib/duplicate-candidate/types";

export interface DuplicateMatchSummary {
  candidate_id: string;
  analysis_id: string | null;
  job_title: string | null;
  created_at: string | null;
  match_category: string | null;
  disposition: string | null;
}

export interface DuplicateConfirmationRequired {
  status: "DUPLICATE_CONFIRMATION_REQUIRED";
  code: "DUPLICATE_CONFIRMATION_REQUIRED";
  candidate_name: string;
  duplicate_confidence: DuplicateConfidence;
  matches: DuplicateMatchSummary[];
  duplicate_confirmation_token: string;
}

export function isDuplicateConfirmationRequired(
  data: unknown
): data is DuplicateConfirmationRequired {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.status === "DUPLICATE_CONFIRMATION_REQUIRED" ||
    d.code === "DUPLICATE_CONFIRMATION_REQUIRED"
  );
}

export function duplicateWarningMessage(
  candidateName: string,
  confidence: DuplicateConfidence
): string {
  if (confidence === "HIGH") {
    return `A likely duplicate candidate was found for “${candidateName}”.\n\nDo you still want to continue and create another analysis?`;
  }
  return `A candidate named “${candidateName}” already exists.\n\nThis may be a different person with the same name.\n\nDo you still want to continue?`;
}
