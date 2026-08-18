/**
 * Pure helpers for candidate CRM rules (unit-testable without DB).
 */

export function shouldRecordStatusChange(
  previousStatusId: string | null | undefined,
  nextStatusId: string
): boolean {
  return previousStatusId !== nextStatusId;
}

export function canEditNote(params: {
  authorUserId: string | null;
  actorUserId: string;
  actorRole: "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER";
}): boolean {
  if (params.authorUserId === params.actorUserId) return true;
  return params.actorRole === "TENANT_ADMIN" || params.actorRole === "SUPER_ADMIN";
}

export type CrmActorRole = "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER";

/** Consistent empty-value placeholder for listing tables. */
export function displayOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

/** Normalize a free-text search query (trim + collapse internal whitespace). */
export function normalizeSearchQuery(query: string | null | undefined): string {
  return (query ?? "").trim().replace(/\s+/g, " ");
}

export function buildStatusChangeMetadata(params: {
  previousStatusId: string | null | undefined;
  newStatusId: string;
  note?: string | null;
}): Record<string, unknown> {
  const note = params.note?.trim() || null;
  return {
    previous_status_id: params.previousStatusId ?? null,
    new_status_id: params.newStatusId,
    ...(note ? { note } : {}),
  };
}

export function extractStatusChangeNote(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const note = metadata.note;
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  return trimmed || null;
}

export interface StatusHistoryEntry {
  id: string;
  previousStatus: string | null;
  newStatus: string | null;
  note: string | null;
  updatedBy: string | null;
  changedAt: string;
}

/** Filter and map activity rows into status history (newest-first preserved). */
export function toStatusHistory(
  activity: Array<{
    id: string;
    action_type: string;
    previous_value: string | null;
    new_value: string | null;
    performer_name: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>
): StatusHistoryEntry[] {
  return activity
    .filter((item) => item.action_type === "STATUS_CHANGED")
    .map((item) => ({
      id: item.id,
      previousStatus: item.previous_value,
      newStatus: item.new_value,
      note: extractStatusChangeNote(item.metadata),
      updatedBy: item.performer_name,
      changedAt: item.created_at,
    }));
}

/** Strip LIKE/ILIKE wildcards from user search input (partial match is applied by us). */
export function sanitizeJobSearchTerm(value: string): string {
  return value.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function toJobSearchPattern(query: string | null | undefined): string | null {
  const normalized = sanitizeJobSearchTerm(normalizeSearchQuery(query));
  if (!normalized) return null;
  return `%${normalized}%`;
}

/** Same ILIKE pattern builder used for candidate free-text search. */
export function toCandidateSearchPattern(
  query: string | null | undefined
): string | null {
  return toJobSearchPattern(query);
}

/**
 * Digits-only pattern for phone search so "7034097129" matches
 * "+1 (703) 409-7129". Returns null when fewer than 3 digits are present.
 */
export function toPhoneDigitsSearchPattern(
  query: string | null | undefined
): string | null {
  const digits = (query ?? "").replace(/\D/g, "");
  if (digits.length < 3) return null;
  return `%${digits}%`;
}

/** Pure helper for unit tests / client-side empty checks. */
export function matchesCandidateSearch(
  row: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    job_code?: string | null;
    job_title?: string | null;
    status_name?: string | null;
    assigned_recruiter_name?: string | null;
  },
  query: string | null | undefined,
  opts?: { includeContact?: boolean }
): boolean {
  const q = normalizeSearchQuery(query).toLowerCase();
  if (!q) return true;
  const includeContact = opts?.includeContact ?? true;
  const textParts = [
    row.full_name,
    row.job_code,
    row.job_title,
    row.status_name,
    row.assigned_recruiter_name,
    ...(includeContact ? [row.email, row.phone] : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (textParts.includes(q)) return true;
  if (includeContact) {
    const needle = q.replace(/\D/g, "");
    if (needle.length >= 3) {
      const hay = (row.phone ?? "").replace(/\D/g, "");
      if (hay.includes(needle)) return true;
    }
  }
  return false;
}

export function matchesJobSearch(
  workspace: {
    job_title?: string | null;
    job_ref?: string | null;
    department?: string | null;
    msp_or_client?: string | null;
    location?: string | null;
    specialty?: string | null;
  },
  query: string | null | undefined
): boolean {
  const q = normalizeSearchQuery(query).toLowerCase();
  if (!q) return true;
  const haystack = [
    workspace.job_title,
    workspace.job_ref,
    workspace.department,
    workspace.msp_or_client,
    workspace.location,
    workspace.specialty,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function formatActivitySummary(params: {
  actionType: string;
  previousValue?: string | null;
  newValue?: string | null;
}): string {
  const { actionType, previousValue, newValue } = params;
  switch (actionType) {
    case "STATUS_CHANGED":
      return `Status changed from "${previousValue ?? "—"}" to "${newValue ?? "—"}"`;
    case "NOTE_ADDED":
      return "Note added";
    case "NOTE_EDITED":
      return "Note edited";
    case "NOTE_DELETED":
      return "Note deleted";
    case "CANDIDATE_ASSIGNED":
      return `Assignment changed from "${previousValue ?? "Unassigned"}" to "${newValue ?? "Unassigned"}"`;
    case "CANDIDATE_CREATED":
      return "Candidate created";
    case "RESUME_UPLOADED":
      return "Resume uploaded";
    case "RESUME_REPLACED":
      return "Resume replaced";
    case "ANALYSIS_COMPLETED":
      return "Analysis completed";
    case "ANALYSIS_RERUN":
      return "Analysis rerun";
    case "ANALYSIS_STARTED":
      return "Analysis started";
    case "DUPLICATE_WARNING_ACCEPTED":
      return "Duplicate candidate warning accepted";
    case "CANDIDATE_SUBMITTED_TO_JOB":
      return "Candidate submitted to a job";
    case "DISPOSITION_UPDATED":
      return `Disposition updated${newValue ? `: ${newValue}` : ""}`;
    case "USER_LOGIN":
      return "Signed in";
    case "CANDIDATE_IMPORTED":
      return "Candidate imported";
    case "CANDIDATE_REASSIGNED":
      return `Reassigned from "${previousValue ?? "Unassigned"}" to "${newValue ?? "Unassigned"}"`;
    case "RESUME_DOWNLOADED":
      return "Resume downloaded";
    case "ANALYSIS_FAILED":
      return "Analysis failed";
    case "ASSESSMENT_DOWNLOADED":
      return "Assessment downloaded";
    case "CANDIDATE_ADDED_TO_JOB":
      return "Candidate added to a job";
    case "CANDIDATE_REMOVED_FROM_JOB":
      return "Candidate removed from a job";
    case "CANDIDATE_QUALIFIED":
      return "Candidate qualified";
    case "CANDIDATE_SUBMITTED":
      return "Candidate submitted";
    case "INTERVIEW_SCHEDULED":
      return "Interview scheduled";
    case "OFFER_EXTENDED":
      return "Offer extended";
    case "CANDIDATE_HIRED":
      return "Candidate hired";
    case "CANDIDATE_REJECTED":
      return "Candidate rejected";
    case "CANDIDATE_ON_HOLD":
      return "Candidate placed on hold";
    case "CANDIDATE_UNREACHABLE":
      return "Candidate marked unreachable";
    case "JOB_CREATED":
      return `Job created${newValue ? `: ${newValue}` : ""}`;
    case "JOB_EDITED":
      return `Job edited${newValue ? `: ${newValue}` : ""}`;
    case "JOB_ARCHIVED":
      return `Job archived${newValue ? `: ${newValue}` : ""}`;
    case "JOB_REOPENED":
      return `Job unarchived${newValue ? `: ${newValue}` : ""}`;
    default:
      return actionType.replace(/_/g, " ").toLowerCase();
  }
}

export function assertSameTenant(
  resourceTenantId: string | null | undefined,
  userTenantId: string | null | undefined
): boolean {
  if (!resourceTenantId || !userTenantId) return false;
  return resourceTenantId === userTenantId;
}
