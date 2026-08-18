import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import {
  getWorkspace,
  updateWorkspace,
  setWorkspaceStatus,
  deleteWorkspace,
  type WorkspaceInput,
} from "@/lib/dal/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withTenantUser("workspaces.update", async (user) => {
    const existing = await getWorkspace(user, params.workspaceId);
    if (!existing) return fail("Workspace not found.", 404, "NOT_FOUND");

    const body = (await req.json()) as WorkspaceInput & {
      workspace_status?: "ACTIVE" | "ARCHIVED";
    };
    const { workspace_status, ...workspaceFields } = body;
    if (workspace_status === "ARCHIVED" || workspace_status === "ACTIVE") {
      await setWorkspaceStatus(user, params.workspaceId, workspace_status);
    }
    const hasWorkspaceUpdates = Object.values(workspaceFields).some(
      (value) => value !== undefined
    );
    if (hasWorkspaceUpdates) {
      await updateWorkspace(user, params.workspaceId, workspaceFields);
    }
    return ok({ id: params.workspaceId });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withTenantUser("workspaces.delete", async (user) => {
    const result = await deleteWorkspace(user, params.workspaceId);
    if (!result.deleted) return fail("Workspace not found.", 404, "NOT_FOUND");
    return ok(result);
  });
}
