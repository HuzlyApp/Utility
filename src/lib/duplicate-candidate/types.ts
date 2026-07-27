export type DuplicateConfidence = "HIGH" | "POSSIBLE";

export interface DuplicateMatch {
  candidate_id: string;
  analysis_id: string | null;
  job_title: string | null;
  created_at: string | null;
  match_category: string | null;
  disposition: string | null;
  /** Present during server-side classification; omitted from API responses. */
  matched_identifiers?: string[];
}

export interface DuplicateCheckResult {
  candidate_name: string;
  normalized_name: string;
  duplicate_confidence: DuplicateConfidence;
  matches: DuplicateMatch[];
  duplicate_confirmation_token: string;
}

export interface DuplicateConfirmationPayload {
  uid: string;
  tid: string;
  cid: string;
  nn: string;
  mcids: string[];
  maids: string[];
  conf: DuplicateConfidence;
  exp: number;
  jti: string;
}
