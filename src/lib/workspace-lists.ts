import type { JobStatus, WorkspaceStatus, WorkspaceSummary } from "@/lib/dal/types";
import type { JobListStatus } from "@/lib/routes";

export const JOB_SORT_KEYS = ["updated", "created"] as const;
export type JobSortKey = (typeof JOB_SORT_KEYS)[number];
export type JobSortDir = "asc" | "desc";

export const DEFAULT_JOB_SORT: JobSortKey = "updated";
export const DEFAULT_JOB_SORT_DIR: JobSortDir = "desc";

const JOB_SORT_KEY_SET = new Set<string>(JOB_SORT_KEYS);

/** Job lifecycle statuses that remain on the Active tab (not CLOSED). */
export const ACTIVE_LIST_JOB_STATUSES: readonly JobStatus[] = [
  "OPEN",
  "ON_HOLD",
  "FILLED",
] as const;

const ACTIVE_LIST_JOB_STATUS_SET = new Set<string>(ACTIVE_LIST_JOB_STATUSES);

const JOB_STATUS_ALIASES: Record<string, JobStatus> = {
  OPEN: "OPEN",
  ACTIVE: "OPEN",
  ON_HOLD: "ON_HOLD",
  ONHOLD: "ON_HOLD",
  "ON-HOLD": "ON_HOLD",
  FILLED: "FILLED",
  CLOSED: "CLOSED",
  CLOSE: "CLOSED",
};

const WORKSPACE_STATUS_ALIASES: Record<string, WorkspaceStatus> = {
  ACTIVE: "ACTIVE",
  OPEN: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  ARCHIVE: "ARCHIVED",
};

export function parseJobSortParam(
  value: string | string[] | null | undefined
): JobSortKey {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && JOB_SORT_KEY_SET.has(raw)) return raw as JobSortKey;
  return DEFAULT_JOB_SORT;
}

export function parseJobSortDirParam(
  value: string | string[] | null | undefined
): JobSortDir {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "asc" ? "asc" : DEFAULT_JOB_SORT_DIR;
}

/** Normalize persisted/legacy job_status strings to the canonical enum. */
export function normalizeJobStatus(
  raw: string | null | undefined
): JobStatus | null {
  if (raw == null) return null;
  const key = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (!key) return null;
  return JOB_STATUS_ALIASES[key] ?? null;
}

/** Normalize persisted/legacy workspace_status strings. */
export function normalizeWorkspaceStatus(
  raw: string | null | undefined
): WorkspaceStatus | null {
  if (raw == null) return null;
  const key = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (!key) return null;
  return WORKSPACE_STATUS_ALIASES[key] ?? null;
}

export function isArchivedWorkspace(workspace: {
  workspace_status?: string | null;
}): boolean {
  return normalizeWorkspaceStatus(workspace.workspace_status) === "ARCHIVED";
}

export function isClosedJob(workspace: {
  job_status?: string | null;
}): boolean {
  return normalizeJobStatus(workspace.job_status) === "CLOSED";
}

/**
 * Canonical Active-list membership:
 * workspace not archived AND job_status is an active/open (non-CLOSED) status.
 * Null/unknown job_status is treated as OPEN (schema default).
 */
export function isActiveListWorkspace(workspace: {
  workspace_status?: string | null;
  job_status?: string | null;
}): boolean {
  if (isArchivedWorkspace(workspace)) return false;
  const jobStatus = normalizeJobStatus(workspace.job_status) ?? "OPEN";
  return ACTIVE_LIST_JOB_STATUS_SET.has(jobStatus);
}

export const JOB_LIST_STATUS_HEADINGS: Record<JobListStatus, string> = {
  active: "Active Jobs",
  archived: "Archived Jobs",
  all: "All Jobs",
};

/** Filter workspaces for the Active / Archived / All tabs. */
export function filterWorkspacesForTab(
  workspaces: WorkspaceSummary[],
  status: JobListStatus
): WorkspaceSummary[] {
  switch (status) {
    case "active":
      return workspaces.filter(isActiveListWorkspace);
    case "archived":
      return workspaces.filter(isArchivedWorkspace);
    case "all":
      return workspaces;
  }
}

/**
 * Split into Active vs Archived buckets.
 * Closed (non-archived) jobs are excluded from both — they belong under All only.
 */
export function splitWorkspaces(workspaces: WorkspaceSummary[]): {
  active: WorkspaceSummary[];
  archived: WorkspaceSummary[];
  closed: WorkspaceSummary[];
} {
  const active: WorkspaceSummary[] = [];
  const archived: WorkspaceSummary[] = [];
  const closed: WorkspaceSummary[] = [];
  for (const workspace of workspaces) {
    if (isArchivedWorkspace(workspace)) archived.push(workspace);
    else if (isClosedJob(workspace)) closed.push(workspace);
    else active.push(workspace);
  }
  return { active, archived, closed };
}
