import type { WorkspaceSummary } from "@/lib/dal/types";

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
