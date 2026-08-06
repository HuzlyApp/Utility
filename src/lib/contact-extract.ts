/**
 * Pure resume contact extraction (unit-testable without DB/filesystem).
 */

import { normalizeEmail, normalizePhone } from "@/lib/duplicate-candidate/normalize";

export type ContactSource = "RESUME" | "MANUAL" | "MANUAL_CORRECTED";

/** Canonical contact-extraction lifecycle statuses. */
export type ContactExtractionStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "not_found"
  | "failed";

export const CONTACT_EXTRACTION_MAX_ATTEMPTS = 3;
/** Treat pending/processing older than this as stale/failed. */
export const CONTACT_EXTRACTION_STALE_MS = 90_000;
export const CONTACT_EXTRACTION_POLL_MS = 3_000;
export const CONTACT_EXTRACTION_POLL_MAX_MS = 120_000;

const EMAIL_RE =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b|\+\d{10,15}\b/g;

const RECRUITER_EMAIL_HINTS =
  /recruit|talent|hr@|careers@|jobs@|noreply|no-reply|donotreply|support@|info@|admin@/i;

const TEMPLATE_EMAIL_HINTS =
  /^(email|name|your\.?email|user|test)@|@(example|test|sample)\.(com|org|net)$/i;

export interface ExtractedContact {
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  status: "completed" | "not_found";
  alternatives?: {
    emails: string[];
    phones: string[];
  };
}

/** Map legacy DB values to the canonical status set. */
export function normalizeContactExtractionStatus(
  value: string | null | undefined
): ContactExtractionStatus {
  const raw = (value ?? "pending").trim().toLowerCase();
  switch (raw) {
    case "pending":
    case "not_processed":
    case "not_started":
      return "pending";
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "completed":
    case "extracted":
      return "completed";
    case "not_found":
      return "not_found";
    case "failed":
    case "stale":
      return "failed";
    default:
      return "pending";
  }
}

export function isContactExtractionInFlight(
  status: string | null | undefined,
  startedAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  const normalized = normalizeContactExtractionStatus(status);
  if (
    normalized !== "pending" &&
    normalized !== "queued" &&
    normalized !== "processing"
  ) {
    return false;
  }
  if (!startedAt && (normalized === "pending" || normalized === "queued")) {
    return true;
  }
  if (!startedAt) return true;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return true;
  return nowMs - started < CONTACT_EXTRACTION_STALE_MS;
}

export function isContactExtractionStale(
  status: string | null | undefined,
  startedAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  const normalized = normalizeContactExtractionStatus(status);
  if (
    normalized !== "pending" &&
    normalized !== "queued" &&
    normalized !== "processing"
  ) {
    return false;
  }
  if (!startedAt) return false;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return nowMs - started >= CONTACT_EXTRACTION_STALE_MS;
}

export function canRetryContactExtraction(params: {
  status: string | null | undefined;
  attempts?: number | null;
  startedAt?: string | null;
}): boolean {
  const status = normalizeContactExtractionStatus(params.status);
  const attempts = Number(params.attempts ?? 0);
  if (attempts >= CONTACT_EXTRACTION_MAX_ATTEMPTS) return false;
  if (status === "failed") return true;
  if (isContactExtractionStale(status, params.startedAt)) return true;
  return false;
}

function headerWindow(text: string, maxLines = 25): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
}

function scoreEmail(email: string, inHeader: boolean): number {
  let score = inHeader ? 40 : 10;
  if (RECRUITER_EMAIL_HINTS.test(email)) score -= 50;
  if (TEMPLATE_EMAIL_HINTS.test(email)) score -= 80;
  if (/\.(edu|com|net|org|io|co)$/i.test(email.split("@")[1] ?? "")) score += 5;
  return score;
}

function looksLikeNonPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return true;
  if (/^\d{4}$/.test(digits)) return true;
  if (/^(19|20)\d{2}$/.test(digits)) return true;
  if (digits.length === 5) return true;
  return false;
}

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw.trim().replace(/\s+/g, " ");
}

function scorePhone(raw: string, inHeader: boolean): number {
  if (looksLikeNonPhone(raw)) return -100;
  const digits = raw.replace(/\D/g, "");
  let score = inHeader ? 40 : 10;
  if (digits.length === 10 || digits.length === 11) score += 20;
  if (raw.includes("+")) score += 5;
  if (raw.includes("(") || raw.includes("-")) score += 5;
  return score;
}

/**
 * Extract the most likely primary email and phone from résumé text.
 */
export function extractContactsFromResumeText(
  text: string | null | undefined
): ExtractedContact {
  const raw = (text ?? "").trim();
  if (!raw) {
    return {
      email: null,
      emailNormalized: null,
      phone: null,
      phoneNormalized: null,
      status: "not_found",
      alternatives: { emails: [], phones: [] },
    };
  }

  const header = headerWindow(raw);
  const emailMatches = Array.from(new Set(raw.match(EMAIL_RE) ?? []));
  const phoneMatches = Array.from(new Set(raw.match(PHONE_RE) ?? []));

  const rankedEmails = emailMatches
    .map((email) => ({
      email,
      score: scoreEmail(email, header.toLowerCase().includes(email.toLowerCase())),
    }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);

  const rankedPhones = phoneMatches
    .map((phone) => ({
      phone,
      score: scorePhone(phone, header.includes(phone)),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestEmail = rankedEmails[0]?.email ?? null;
  const bestPhone = rankedPhones[0]?.phone ?? null;
  const displayPhone = bestPhone ? formatPhoneDisplay(bestPhone) : null;

  const found = Boolean(bestEmail || displayPhone);
  return {
    email: bestEmail,
    emailNormalized: normalizeEmail(bestEmail),
    phone: displayPhone,
    phoneNormalized: normalizePhone(bestPhone),
    status: found ? "completed" : "not_found",
    alternatives: {
      emails: rankedEmails.slice(1, 4).map((e) => e.email),
      phones: rankedPhones.slice(1, 4).map((p) => formatPhoneDisplay(p.phone)),
    },
  };
}

export function hasContactDetails(contact: {
  email?: string | null;
  phone?: string | null;
}): boolean {
  return Boolean(contact.email?.trim() || contact.phone?.trim());
}

/** Whether automated extraction may overwrite this contact field. */
export function canOverwriteContactWithResume(
  source: ContactSource | string | null | undefined,
  force = false
): boolean {
  if (force) return true;
  if (!source) return true;
  if (source === "RESUME") return true;
  return false;
}

export function displayContactValue(params: {
  value: string | null | undefined;
  extractionStatus: ContactExtractionStatus | string | null | undefined;
  canViewContact: boolean;
  startedAt?: string | null;
}): string {
  if (!params.canViewContact) return "Restricted";
  const trimmed = params.value?.trim();
  if (trimmed) return trimmed;

  const status = normalizeContactExtractionStatus(params.extractionStatus);
  if (isContactExtractionStale(status, params.startedAt)) {
    return "Did not complete";
  }
  if (status === "pending" || status === "queued" || status === "processing") {
    return "Extracting…";
  }
  if (status === "not_found") return "Not found";
  if (status === "failed") return "—";
  // completed with no value for this field
  return "—";
}

export function getSafeContactExtractionError(
  error: unknown
): string {
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim().slice(0, 240);
    // Avoid leaking paths / secrets
    if (/password|secret|token|ECONN|ENOTFOUND/i.test(msg)) {
      return "Contact extraction failed due to a processing error.";
    }
    return msg;
  }
  return "Contact extraction failed due to an unexpected error.";
}
