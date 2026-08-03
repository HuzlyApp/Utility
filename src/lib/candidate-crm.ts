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
