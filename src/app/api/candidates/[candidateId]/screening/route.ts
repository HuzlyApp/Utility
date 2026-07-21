import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getCandidate } from "@/lib/dal/candidates";
import { saveScreeningAnswer } from "@/lib/dal/screening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records a recruiter's answer to an AI-generated screening question (spec §11).
export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withUser("candidates.screening", async (user) => {
    const body = (await req.json()) as {
      workspace_id?: string;
      question?: string;
      answer?: string;
      related_requirement?: string;
      priority?: number;
      analysis_id?: string;
    };
    if (!body.workspace_id || !body.question) {
      return fail("workspace_id and question are required.", 400, "MISSING_FIELDS");
    }
    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");

    await saveScreeningAnswer({
      user,
      candidateId: params.candidateId,
      workspaceId: body.workspace_id,
      analysisId: body.analysis_id ?? null,
      question: body.question,
      answer: body.answer ?? "",
      relatedRequirement: body.related_requirement,
      priority: body.priority,
    });
    return ok({});
  });
}
