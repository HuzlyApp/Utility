import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { getCandidate } from "@/lib/dal/candidates";
import { listCandidateActivity } from "@/lib/dal/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.activity.get", async (user) => {
    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");
    const activity = await listCandidateActivity(user, params.candidateId);
    return ok({ activity });
  });
}
