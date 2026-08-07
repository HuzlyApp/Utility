/**
 * Pure résumé contact extraction (unit-testable without DB/filesystem).
 */

import { normalizeEmail, normalizePhone } from "@/lib/duplicate-candidate/normalize";

export type ContactSource = "RESUME" | "MANUAL" | "MANUAL_CORRECTED" | "IMPORTED";

/** Canonical contact-extraction lifecycle statuses. */
export type ContactExtractionStatus =
  | "not_started"
  | "queued"
  | "processing"
  | "completed"
  | "not_found"
  | "failed"
  | "stale";

export type ContactExtractionFailureCategory =
  | "resume_not_found"
  | "resume_download_failed"
  | "unsupported_format"
  | "pdf_parse_failed"
  | "docx_parse_failed"
  | "ocr_failed"
  | "empty_text"
  | "email_not_found"
  | "phone_not_found"
  | "database_update_failed"
  | "worker_failed"
  | "timeout"
  | "max_attempts"
  | "extraction_error";

export const CONTACT_EXTRACTION_MAX_ATTEMPTS = 3;
/** Treat queued/processing older than this as stale (2 minutes). */
export const CONTACT_EXTRACTION_STALE_MS = 120_000;
export const CONTACT_EXTRACTION_POLL_MS = 3_000;
export const CONTACT_EXTRACTION_POLL_MAX_MS = 120_000;

/** Backoff before automatic retry after attempt N completed as failed (0-indexed next attempt). */
export const CONTACT_EXTRACTION_AUTO_RETRY_BACKOFF_MS = [
  0, // attempt 1: immediate
  5_000, // attempt 2: short backoff
  30_000, // attempt 3: longer backoff
] as const;

const EMAIL_RE =
  /(?:mailto:)?([A-Z0-9](?:[A-Z0-9._%+-]*[A-Z0-9])?@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,24})/gi;

/** Bare / formatted US-style phones, including contiguous 10-digit runs. */
const PHONE_RE =
  /(?:\+?\s*1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b|\+\d{1,3}[\s.-]?(?:\(?\d{2,4}\)?[\s.-]*){2,4}\d{3,4}\b|\b\d{3}[.-]\d{3}[.-]\d{4}\b|\b\d{10,11}\b/g;

const TEMPLATE_EMAIL_HINTS =
  /^(email|name|your\.?email|user|test)@|@(example|test|sample|domain)\.(com|org|net)$/i;

const URL_CONTEXT_RE =
  /https?:\/\/|www\.|\.html?\b|\/[a-z0-9_-]+\/[a-z0-9_-]+/i;

/** Common TLDs used to recover emails glued to city/location text. */
const KNOWN_EMAIL_TLDS = new Set([
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "io",
  "co",
  "uk",
  "us",
  "ca",
  "au",
  "info",
  "biz",
  "me",
  "tv",
  "app",
  "dev",
  "ai",
  "tech",
]);

/**
 * Normalize résumé text before email/phone detection.
 * PDFs, DOCX, OCR, and copy/paste often introduce Unicode dashes, spaces,
 * zero-width characters, and glued tokens (phone+email+city).
 */
export function normalizeResumeTextForContactExtraction(
  text: string | null | undefined
): string {
  if (!text) return "";
  let out = text
    .normalize("NFKC")
    // Common dash/hyphen/minus variants → ASCII hyphen-minus
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    // Non-breaking / figure / narrow spaces → regular space
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    // Zero-width / BOM characters that hide between digits
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

  // Insert boundaries for glued PDF spans without breaking emails that contain digits.
  // 7373210994micheal… / 7432candidate@… → insert a space before the letters
  out = out.replace(/(\d)([A-Za-z])/g, "$1 $2");
  // .comBaytown → .com Baytown (capitalized location tokens only)
  out = out.replace(
    /(\.(?:com|net|org|edu|gov|info|biz|me|tv|app|dev|ai|tech|io|co\.uk|uk|us|ca|au|co))(?=[A-Z])/g,
    "$1 "
  );

  return out
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

/** Permanent failures that should not auto-retry (manual retry still allowed). */
export const PERMANENT_CONTACT_FAILURE_CATEGORIES = new Set<ContactExtractionFailureCategory>([
  "empty_text",
  "unsupported_format",
  "resume_not_found",
]);

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

export interface ContactExtractionApiSummary {
  status: ContactExtractionStatus;
  attempts: number;
  can_retry: boolean;
  started_at?: string | null;
  completed_at?: string | null;
}

/** Map legacy DB values to the canonical status set. */
export function normalizeContactExtractionStatus(
  value: string | null | undefined
): ContactExtractionStatus {
  const raw = (value ?? "not_started").trim().toLowerCase();
  switch (raw) {
    case "pending":
    case "not_processed":
    case "not_started":
      return "not_started";
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
      return "failed";
    case "stale":
      return "stale";
    default:
      return "not_started";
  }
}

export function isContactExtractionInFlight(
  status: string | null | undefined,
  startedAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  const normalized = normalizeContactExtractionStatus(status);
  if (
    normalized !== "not_started" &&
    normalized !== "queued" &&
    normalized !== "processing"
  ) {
    return false;
  }
  if (isContactExtractionStale(status, startedAt, nowMs)) return false;
  return true;
}

export function isContactExtractionStale(
  status: string | null | undefined,
  startedAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  const normalized = normalizeContactExtractionStatus(status);
  if (normalized === "stale") return true;
  if (
    normalized !== "not_started" &&
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
  /** When true, allow retry even at max attempts (authorized manual retry). */
  force?: boolean;
}): boolean {
  if (params.force) return true;
  const status = normalizeContactExtractionStatus(params.status);
  const attempts = Number(params.attempts ?? 0);
  if (attempts >= CONTACT_EXTRACTION_MAX_ATTEMPTS) return false;
  if (status === "failed" || status === "stale") return true;
  if (isContactExtractionStale(status, params.startedAt)) return true;
  return false;
}

/** Whether background auto-retry is eligible given attempts + last completion time. */
export function canAutoRetryContactExtraction(params: {
  status: string | null | undefined;
  attempts?: number | null;
  completedAt?: string | null;
  errorCategory?: string | null;
  nowMs?: number;
}): boolean {
  const status = normalizeContactExtractionStatus(params.status);
  if (status !== "failed" && status !== "stale") return false;
  const attempts = Number(params.attempts ?? 0);
  if (attempts >= CONTACT_EXTRACTION_MAX_ATTEMPTS) return false;
  if (
    params.errorCategory &&
    PERMANENT_CONTACT_FAILURE_CATEGORIES.has(
      params.errorCategory as ContactExtractionFailureCategory
    )
  ) {
    return false;
  }
  const backoff =
    CONTACT_EXTRACTION_AUTO_RETRY_BACKOFF_MS[
      Math.min(attempts, CONTACT_EXTRACTION_AUTO_RETRY_BACKOFF_MS.length - 1)
    ] ?? 30_000;
  if (backoff <= 0) return true;
  if (!params.completedAt) return true;
  const completed = new Date(params.completedAt).getTime();
  if (Number.isNaN(completed)) return true;
  const nowMs = params.nowMs ?? Date.now();
  return nowMs - completed >= backoff;
}

function headerWindow(text: string, maxLines = 25): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
}

/** Strip accidental punctuation / wrappers and recover glued phone/city fragments. */
export function sanitizeEmailCandidate(raw: string): string | null {
  let v = raw.trim().replace(/^mailto:/i, "");
  v = v.replace(/^[\s<"'({\[]+/, "").replace(/[\s>"')}\],;:!?]+$/g, "");
  v = v.replace(/[.,;:]+$/g, "").trim().toLowerCase();

  // Recover glued location after a known TLD: gmail.combaytown → gmail.com
  v = recoverEmailFromGluedDomain(v);

  // Recover glued leading phone digits: 7373210994name@gmail.com → name@gmail.com
  v = recoverEmailFromLeadingPhoneDigits(v);

  if (!isValidEmail(v)) return null;
  return v;
}

function recoverEmailFromGluedDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  let domain = email.slice(at + 1);

  // Prefer splitting on known TLDs when extra letters follow.
  for (const tld of KNOWN_EMAIL_TLDS) {
    const marker = `.${tld}`;
    const idx = domain.indexOf(marker);
    if (idx >= 0) {
      const after = domain.slice(idx + marker.length);
      if (after.length >= 2 && /^[a-z]+$/i.test(after)) {
        domain = domain.slice(0, idx + marker.length);
        break;
      }
    }
  }

  // Also handle Capitalized glue without prior split: comBaytown
  const m = domain.match(/^([a-z0-9.-]+\.[a-z]{2,10})([A-Z][a-zA-Z]+)$/);
  if (m) domain = m[1];

  return `${local}@${domain}`;
}

function recoverEmailFromLeadingPhoneDigits(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // Strip a leading 10/11-digit US phone glued onto the local part.
  const phonePrefix = local.match(/^(1?\d{10})([a-z][a-z0-9._%+-]*)$/i);
  if (phonePrefix) {
    return `${phonePrefix[2]}@${domain}`;
  }
  // Or 7–15 digit run if remaining local still looks like a name/handle
  const digitPrefix = local.match(/^(\d{7,15})([a-z][a-z0-9._%+-]{2,})$/i);
  if (digitPrefix) {
    return `${digitPrefix[2]}@${domain}`;
  }
  return email;
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  if ((email.match(/@/g) ?? []).length !== 1) return false;
  if (email.includes("..") || email.startsWith(".") || email.includes("@.")) return false;
  if (URL_CONTEXT_RE.test(email)) return false;

  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length > 64 || local.length < 1) return false;
  if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?$/i.test(local) && !/^[a-z0-9]$/i.test(local)) {
    return false;
  }
  // Reject locals that are mostly a phone number
  if (/^\d{7,}$/.test(local.replace(/[._+-]/g, ""))) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1]?.toLowerCase() ?? "";
  if (!/^[a-z]{2,24}$/.test(tld)) return false;
  // Reject glued city TLDs like "combaytown"
  if (tld.length > 10 && !KNOWN_EMAIL_TLDS.has(tld)) return false;
  if (tld.length >= 4 && !KNOWN_EMAIL_TLDS.has(tld) && !/^[a-z]{2,6}$/.test(tld)) {
    return false;
  }
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label) && !/^[a-z0-9]$/i.test(label)) {
      return false;
    }
  }
  return true;
}

/** True when a persisted email looks corrupted (phone+email, email+city, etc.). */
export function isCorruptEmailValue(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  if (!v) return false;
  if (/\s/.test(v)) return true;
  if ((v.match(/@/g) ?? []).length !== 1) return true;
  if (/phone\s*:/i.test(v)) return true;
  // Digits glued before local part without being a valid recovered email
  if (/^\d{7,}[a-z]/i.test(v) && !isValidEmail(sanitizeEmailCandidate(v) ?? "")) {
    return true;
  }
  if (/^\d{7,}.*@/.test(v)) {
    const recovered = sanitizeEmailCandidate(v);
    if (!recovered || recovered !== v.toLowerCase().replace(/^mailto:/i, "")) {
      // Original is corrupt even if we can recover a clean email from it
      if (!isValidEmail(v.toLowerCase())) return true;
      // Still treat glued phone-prefix as corrupt for display/retry
      if (/^\d{7,}[a-z]/i.test(v)) return true;
    }
  }
  // Location glued after TLD: gmail.comBaytown
  if (/@[a-z0-9.-]+\.(com|net|org|edu|io|co)[a-z]{3,}$/i.test(v) && !isValidEmail(v)) {
    return true;
  }
  if (!isValidEmail(v.toLowerCase())) return true;
  return false;
}

export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return false;
  if (/[a-z@]/i.test(phone) && !/^\s*\+?[\d\s().-]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  if (looksLikeNonPhone(phone)) return false;
  return true;
}

export function isCorruptPhoneValue(phone: string | null | undefined): boolean {
  const v = (phone ?? "").trim();
  if (!v) return false;
  if (/@/.test(v)) return true;
  if (/[a-z]/i.test(v) && !/ext\.?/i.test(v)) return true;
  if (/\n/.test(v)) return true;
  return !isValidPhone(v);
}

function isRecruiterOrTemplateEmail(email: string): boolean {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (
    /^(hr|careers|jobs|noreply|no-reply|donotreply|support|info|admin|recruit|talent)([+._-]|$)/i.test(
      local
    )
  ) {
    return true;
  }
  if (/(recruit|talent|careers|jobs)\./i.test(domain)) return true;
  if (TEMPLATE_EMAIL_HINTS.test(email)) return true;
  return false;
}

function scoreEmail(email: string, inHeader: boolean): number {
  let score = inHeader ? 40 : 10;
  if (isRecruiterOrTemplateEmail(email)) score -= 80;
  if (/\.(edu|com|net|org|io|co|uk|ca|au)$/i.test(email.split("@")[1] ?? "")) score += 5;
  if (/\+/.test(email.split("@")[0] ?? "")) score += 2;
  return score;
}

function looksLikeDateOrYear(raw: string, digits: string): boolean {
  if (/^(19|20)\d{2}$/.test(digits)) return true;
  // YYYYMMDD / MMDDYYYY-ish without separators when length 8
  if (digits.length === 8) {
    const yyyyMmDd = Number(digits.slice(0, 4));
    const mm = Number(digits.slice(4, 6));
    const dd = Number(digits.slice(6, 8));
    if (yyyyMmDd >= 1900 && yyyyMmDd <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return true;
    }
  }
  // Common date patterns in the raw string
  if (
    /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(raw) ||
    /\b\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}\b/.test(raw)
  ) {
    return true;
  }
  return false;
}

function looksLikeNonPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return true;
  if (/^\d{4}$/.test(digits)) return true;
  if (digits.length === 5) return true; // ZIP
  if (looksLikeDateOrYear(raw, digits)) return true;
  // Job / employee IDs: long digit runs without phone punctuation, often 6 digits
  if (digits.length === 6 && !/[()+-]/.test(raw)) return true;
  // Sequential / repeated digits (IDs)
  if (/^(\d)\1+$/.test(digits)) return true;
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
  if (raw.trim().startsWith("+")) {
    return raw.trim().replace(/\s+/g, " ");
  }
  return raw.trim().replace(/\s+/g, " ");
}

function scorePhone(raw: string, inHeader: boolean): number {
  if (looksLikeNonPhone(raw)) return -100;
  const digits = raw.replace(/\D/g, "");
  let score = inHeader ? 40 : 10;
  if (digits.length === 10 || digits.length === 11) score += 20;
  if (raw.includes("+")) score += 5;
  if (raw.includes("(") || raw.includes("-") || raw.includes(".")) score += 5;
  return score;
}

function collectEmails(text: string): string[] {
  const found: string[] = [];
  // Also scan original collapsed chunks before normalization split, via the
  // same text (normalization already inserted boundaries).
  const re = new RegExp(EMAIL_RE.source, EMAIL_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const candidate = sanitizeEmailCandidate(match[1] ?? match[0]);
    if (!candidate || !isValidEmail(candidate)) continue;
    const idx = match.index ?? 0;
    const window = text.slice(Math.max(0, idx - 12), idx + (match[0]?.length ?? 0) + 12);
    if (/https?:\/\//i.test(window) || /www\./i.test(window)) continue;
    found.push(candidate);
  }
  return Array.from(new Set(found));
}

function collectPhones(text: string): string[] {
  const found: string[] = [];
  const re = new RegExp(PHONE_RE.source, PHONE_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0].trim();
    if (!isValidPhone(raw)) continue;
    found.push(raw);
  }
  return Array.from(new Set(found));
}

/**
 * Extract the most likely primary email and phone from résumé text.
 * Phone and email are found and validated independently — never from a raw contact line.
 */
export function extractContactsFromResumeText(
  text: string | null | undefined
): ExtractedContact {
  const raw = normalizeResumeTextForContactExtraction(text);
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
  const headerLower = header.toLowerCase();
  const emailMatches = collectEmails(raw);
  const phoneMatches = collectPhones(raw);

  const rankedEmails = emailMatches
    .map((email) => ({
      email,
      score: scoreEmail(email, headerLower.includes(email.toLowerCase())),
    }))
    .filter((e) => e.score > 0 && isValidEmail(e.email))
    .sort((a, b) => b.score - a.score);

  const rankedPhones = phoneMatches
    .map((phone) => ({
      phone,
      score: scorePhone(phone, header.includes(phone)),
    }))
    .filter((p) => p.score > 0 && isValidPhone(p.phone))
    .sort((a, b) => b.score - a.score);

  const bestEmail = rankedEmails[0]?.email ?? null;
  const bestPhone = rankedPhones[0]?.phone ?? null;
  const displayPhone = bestPhone ? formatPhoneDisplay(bestPhone) : null;

  // Final gate: never return unvalidated contact values.
  const email = bestEmail && isValidEmail(bestEmail) ? bestEmail : null;
  const phone = displayPhone && isValidPhone(displayPhone) ? displayPhone : null;

  const found = Boolean(email || phone);
  return {
    email,
    emailNormalized: normalizeEmail(email),
    phone,
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
  // MANUAL, MANUAL_CORRECTED, IMPORTED are protected
  return false;
}

export function displayContactValue(params: {
  value: string | null | undefined;
  extractionStatus: ContactExtractionStatus | string | null | undefined;
  canViewContact: boolean;
  startedAt?: string | null;
  /** When "email" or "phone", corrupt persisted values show as Invalid instead of raw PII. */
  field?: "email" | "phone";
}): string {
  if (!params.canViewContact) return "Restricted";
  const trimmed = params.value?.trim();
  if (trimmed) {
    if (params.field === "email" && isCorruptEmailValue(trimmed)) return "Invalid";
    if (params.field === "phone" && isCorruptPhoneValue(trimmed)) return "Invalid";
    return trimmed;
  }

  const status = normalizeContactExtractionStatus(params.extractionStatus);
  if (status === "stale" || isContactExtractionStale(status, params.startedAt)) {
    return "Timed out";
  }
  if (status === "not_started" || status === "queued" || status === "processing") {
    return "Extracting…";
  }
  if (status === "not_found") return "—";
  if (status === "failed") return "Failed";
  // completed with no value for this field
  return "—";
}

/** True when both phone and email already exist and are valid. */
export function hasCompleteContactDetails(contact: {
  email?: string | null;
  phone?: string | null;
}): boolean {
  return (
    Boolean(contact.email?.trim()) &&
    Boolean(contact.phone?.trim()) &&
    !isCorruptEmailValue(contact.email) &&
    !isCorruptPhoneValue(contact.phone)
  );
}

/**
 * Whether this candidate row should offer a retry action.
 * Never when both contact fields already exist and are valid.
 */
export function needsContactExtractionRetry(params: {
  email?: string | null;
  phone?: string | null;
  status: string | null | undefined;
  attempts?: number | null;
  startedAt?: string | null;
}): boolean {
  if (isCorruptEmailValue(params.email) || isCorruptPhoneValue(params.phone)) {
    return true;
  }
  if (hasCompleteContactDetails(params)) return false;
  return canRetryContactExtraction({
    status: params.status,
    attempts: params.attempts,
    startedAt: params.startedAt,
  });
}

export type ContactFieldUiKind =
  | "restricted"
  | "value"
  | "extracting"
  | "retryable"
  | "empty";

export function getContactFieldUiState(params: {
  value: string | null | undefined;
  extractionStatus: ContactExtractionStatus | string | null | undefined;
  canViewContact: boolean;
  startedAt?: string | null;
  attempts?: number | null;
  field?: "email" | "phone";
}): {
  kind: ContactFieldUiKind;
  label: string;
  canRetry: boolean;
  stale: boolean;
} {
  if (!params.canViewContact) {
    return { kind: "restricted", label: "Restricted", canRetry: false, stale: false };
  }
  const trimmed = params.value?.trim();
  const corrupt =
    (params.field === "email" && isCorruptEmailValue(trimmed)) ||
    (params.field === "phone" && isCorruptPhoneValue(trimmed)) ||
    // When field not specified, still detect obvious email corruption
    (!params.field && isCorruptEmailValue(trimmed));

  if (trimmed && !corrupt) {
    return { kind: "value", label: trimmed, canRetry: false, stale: false };
  }

  const status = normalizeContactExtractionStatus(params.extractionStatus);
  const stale =
    status === "stale" || isContactExtractionStale(status, params.startedAt);
  if (isContactExtractionInFlight(status, params.startedAt) && !corrupt) {
    return { kind: "extracting", label: "Extracting…", canRetry: false, stale: false };
  }
  if (corrupt || status === "failed" || stale) {
    return {
      kind: "retryable",
      label: corrupt ? "Invalid" : stale ? "Timed out" : "Failed",
      canRetry: true,
      stale,
    };
  }
  return { kind: "empty", label: "—", canRetry: false, stale: false };
}

export function resolveTerminalContactStatus(params: {
  email: string | null | undefined;
  phone: string | null | undefined;
  processFailed?: boolean;
}): ContactExtractionStatus {
  if (params.processFailed && !hasContactDetails(params)) return "failed";
  if (hasContactDetails(params)) return "completed";
  return "not_found";
}

export function getSafeContactExtractionError(error: unknown): string {
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

export function classifyContactExtractionFailure(
  error: unknown,
  opts?: { emptyText?: boolean; fileType?: string | null }
): ContactExtractionFailureCategory {
  if (opts?.emptyText) return "empty_text";
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error ?? "");
  if (/timeout|timed out|stale/i.test(msg)) return "timeout";
  if (/unsupported/i.test(msg)) return "unsupported_format";
  if (/ocr/i.test(msg)) return "ocr_failed";
  if (/pdf/i.test(msg) || opts?.fileType === "pdf") return "pdf_parse_failed";
  if (/docx|doc\b|mammoth/i.test(msg) || opts?.fileType === "docx" || opts?.fileType === "doc") {
    return "docx_parse_failed";
  }
  if (/not found|no résumé|no resume/i.test(msg)) return "resume_not_found";
  if (/database|sql|update/i.test(msg)) return "database_update_failed";
  return "extraction_error";
}

export function buildContactExtractionApiSummary(params: {
  status: string | null | undefined;
  attempts?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  forceRetry?: boolean;
}): ContactExtractionApiSummary {
  const status = normalizeContactExtractionStatus(params.status);
  const attempts = Number(params.attempts ?? 0);
  return {
    status,
    attempts,
    can_retry: canRetryContactExtraction({
      status,
      attempts,
      startedAt: params.startedAt,
      force: params.forceRetry,
    }),
    started_at: params.startedAt ?? null,
    completed_at: params.completedAt ?? null,
  };
}

export function logContactExtractionEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  // Structured, PII-light diagnostics for operators.
  console.info(`[contact-extract] ${event}`, {
    ...payload,
    at: new Date().toISOString(),
  });
}
