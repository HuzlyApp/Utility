import { normalizeCandidateName } from "@/lib/duplicate-candidate/normalize";

const STOP_WORDS = new Set([
  "resume",
  "curriculum",
  "vitae",
  "summary",
  "profile",
  "contact",
  "experience",
  "education",
  "skills",
  "objective",
]);

function cleanupToken(token: string): string {
  return token.replace(/[^A-Za-z'.-]/g, "");
}

function toTitleLike(words: string[]): string {
  return words
    .map((w) => (w.length <= 2 ? w.toUpperCase() : `${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`))
    .join(" ");
}

function looksLikeNameWords(words: string[]): boolean {
  if (words.length < 2 || words.length > 4) return false;
  if (words.some((w) => w.length < 2 || w.length > 30)) return false;
  const lowered = words.map((w) => w.toLowerCase());
  if (lowered.some((w) => STOP_WORDS.has(w))) return false;
  return words.every((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
}

/**
 * Heuristic name detection from resume text (first ~10 lines).
 * Returns null when confidence is too weak.
 */
export function detectCandidateNameFromResumeText(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 10);

  for (const line of lines) {
    if (line.length < 3 || line.length > 80) continue;
    if (line.includes("@")) continue;
    if (/\d/.test(line)) continue;
    if (/[:|]/.test(line)) continue;

    const tokens = line
      .split(/\s+/)
      .map(cleanupToken)
      .filter(Boolean);
    if (!looksLikeNameWords(tokens)) continue;
    return toTitleLike(tokens);
  }

  return null;
}

export function namesMatch(existing: string | null, detected: string | null): boolean {
  if (!existing || !detected) return false;
  const a = normalizeCandidateName(existing);
  const b = normalizeCandidateName(detected);
  return Boolean(a && b && a === b);
}

/**
 * Display-only cleanup for candidate names derived from resume filenames
 * (e.g. "ResumeDavidKago" → "DavidKago"). Does not mutate stored data.
 * Strips a leading "Resume" prefix case-insensitively; otherwise returns the
 * trimmed name or "Unnamed candidate" when empty.
 */
export function displayCandidateName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "Unnamed candidate";
  const stripped = raw.replace(/^resume/i, "").trim();
  return stripped || raw;
}
