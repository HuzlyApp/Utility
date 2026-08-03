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
      return `Job reopened${newValue ? `: ${newValue}` : ""}`;
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
