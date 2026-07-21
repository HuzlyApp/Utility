import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getAnalysis } from "@/lib/dal/analyses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  return withUser("analyses.get", async (user) => {
    const analysis = await getAnalysis(user, params.analysisId);
    if (!analysis) return fail("Analysis not found.", 404, "NOT_FOUND");
    return ok({
      analysis_id: analysis.id,
      candidate_id: analysis.candidate_id,
      workspace_id: analysis.workspace_id,
      validated_result: analysis.validated_result,
      score_adjustments: analysis.score_adjustments,
      created_at: analysis.created_at,
    });
  });
}
