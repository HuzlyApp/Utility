import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getCandidate, updateCandidate, type CandidateInput } from "@/lib/dal/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Correct the detected name, extracted résumé text, notes, or verified info
// before analysis (spec §8/§11). Verified info is stored separately as evidence.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withUser("candidates.update", async (user) => {
    const existing = await getCandidate(user, params.candidateId);
    if (!existing) return fail("Candidate not found.", 404, "NOT_FOUND");
    const body = (await req.json()) as CandidateInput;
    await updateCandidate(user, params.candidateId, body);
    return ok({ id: params.candidateId });
  });
}
