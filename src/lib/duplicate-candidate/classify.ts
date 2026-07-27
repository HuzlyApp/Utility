import type { DuplicateConfidence, DuplicateMatch } from "./types";
import { normalizeEmail, normalizePhone } from "./normalize";

export interface CandidateIdentity {
  candidate_id: string;
  email: string | null;
  phone: string | null;
  resume_hash: string | null;
}

/** Classify overall duplicate confidence from individual matches. */
export function resolveDuplicateConfidence(
  matches: DuplicateMatch[]
): DuplicateConfidence {
  if (matches.some((m) => (m.matched_identifiers?.length ?? 0) > 0)) return "HIGH";
  return "POSSIBLE";
}

/**
 * Determine which secondary identifiers match between two candidates.
 * Returns identifier keys only — no raw PII.
 */
export function matchedSecondaryIdentifiers(
  current: CandidateIdentity,
  other: CandidateIdentity
): string[] {
  const ids: string[] = [];
  const currentEmail = normalizeEmail(current.email);
  const otherEmail = normalizeEmail(other.email);
  const currentPhone = normalizePhone(current.phone);
  const otherPhone = normalizePhone(other.phone);

  if (currentEmail && otherEmail && currentEmail === otherEmail) {
    ids.push("email");
  }
  if (currentPhone && otherPhone && currentPhone === otherPhone) {
    ids.push("phone");
  }
  if (
    current.resume_hash &&
    other.resume_hash &&
    current.resume_hash === other.resume_hash
  ) {
    ids.push("resume_hash");
  }
  if (current.candidate_id === other.candidate_id) {
    ids.push("candidate_id");
  }
  return ids;
}
