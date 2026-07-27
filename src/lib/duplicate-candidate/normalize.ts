/** Names too generic to run duplicate detection against. */
const PLACEHOLDER_NAMES = new Set([
  "unnamed candidate",
  "pasted candidate",
]);

/**
 * Normalize a candidate name for duplicate comparison:
 * lowercase, trim, collapse spaces, strip punctuation.
 * Middle initials are preserved as single letters (e.g. "John A. Smith" → "john a smith").
 */
export function normalizeCandidateName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return v.length > 0 ? v : null;
}

/** Keep digits only so "(555) 123-4567" and "5551234567" match. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function isCheckableCandidateName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}
