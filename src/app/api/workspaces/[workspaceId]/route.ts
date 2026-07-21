import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import {
  getWorkspace,
  updateWorkspace,
  setWorkspaceStatus,
  type WorkspaceInput,
} from "@/lib/dal/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withUser("workspaces.update", async (user) => {
    const existing = await getWorkspace(user, params.workspaceId);
    if (!existing) return fail("Workspace not found.", 404, "NOT_FOUND");

    const body = (await req.json()) as WorkspaceInput & { workspace_status?: "ACTIVE" | "ARCHIVED" };
    if (body.workspace_status === "ARCHIVED" || body.workspace_status === "ACTIVE") {
      await setWorkspaceStatus(user, params.workspaceId, body.workspace_status);
    }
    await updateWorkspace(user, params.workspaceId, body);
    return ok({ id: params.workspaceId });
  });
}
