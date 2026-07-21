import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getWorkspace } from "@/lib/dal/workspaces";
import {
  attachCandidateToWorkspace,
  getCandidate,
  removeCandidateFromJob,
} from "@/lib/dal/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attach an EXISTING candidate to this workspace (spec §7 "Select an existing candidate").
export async function POST(
  _req: NextRequest,
  { params }: { params: { workspaceId: string; candidateId: string } }
) {
  return withUser("candidates.attach", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");
    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");
    const hasText = Boolean((candidate.extracted_resume_text ?? "").trim());
    const id = await attachCandidateToWorkspace(
      user,
      params.workspaceId,
      params.candidateId,
      hasText ? "READY" : "NEEDS_REVIEW"
    );
    return ok({ job_match_candidate_id: id });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { workspaceId: string; candidateId: string } }
) {
  return withUser("candidates.remove", async (user) => {
    const removed = await removeCandidateFromJob(user, params.workspaceId, params.candidateId);
    if (!removed) return fail("Candidate not found in this workspace.", 404, "NOT_FOUND");
    return ok({});
  });
}
