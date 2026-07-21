import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getCandidate } from "@/lib/dal/candidates";
import { getWorkspace } from "@/lib/dal/workspaces";
import { recordDisposition, isDashboardDisposition } from "@/lib/dal/dispositions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records the recruiter's final decision, kept SEPARATE from the AI
// recommendation (spec §11).
export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withUser("candidates.disposition", async (user) => {
    const body = (await req.json()) as {
      workspace_id?: string;
      disposition?: string;
      notes?: string;
      analysis_id?: string;
    };
    if (!body.workspace_id) return fail("workspace_id is required.", 400, "MISSING_WORKSPACE");
    if (!body.disposition || !isDashboardDisposition(body.disposition)) {
      return fail("Invalid disposition.", 400, "INVALID_DISPOSITION");
    }
    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");
    const ws = await getWorkspace(user, body.workspace_id);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");

    const id = await recordDisposition({
      user,
      workspaceId: body.workspace_id,
      candidateId: params.candidateId,
      analysisId: body.analysis_id ?? null,
      disposition: body.disposition,
      notes: body.notes,
    });
    return ok({ id });
  });
}
