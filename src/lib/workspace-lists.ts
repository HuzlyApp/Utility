import type { WorkspaceSummary } from "@/lib/dal/types";

export const JOB_SORT_KEYS = ["updated", "created"] as const;
export type JobSortKey = (typeof JOB_SORT_KEYS)[number];
export type JobSortDir = "asc" | "desc";

export const DEFAULT_JOB_SORT: JobSortKey = "updated";
export const DEFAULT_JOB_SORT_DIR: JobSortDir = "desc";

const JOB_SORT_KEY_SET = new Set<string>(JOB_SORT_KEYS);

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

export function splitWorkspaces(workspaces: WorkspaceSummary[]): {
  active: WorkspaceSummary[];
  archived: WorkspaceSummary[];
} {
  const active: WorkspaceSummary[] = [];
  const archived: WorkspaceSummary[] = [];
  for (const workspace of workspaces) {
    if (workspace.workspace_status === "ARCHIVED") archived.push(workspace);
    else active.push(workspace);
  }
  return { active, archived };
}
