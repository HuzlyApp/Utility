import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { getAnalysis } from "@/lib/dal/analyses";
import { verifyAnalysisRequirement } from "@/lib/dal/requirements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persist a recruiter's per-requirement verification (checkbox + note)
 * onto candidate_match_requirements.recruiter_verified /
 * recruiter_verification_note.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  return withTenantUser("requirements.verify", async (user) => {
    const analysis = await getAnalysis(user, params.analysisId);
    if (!analysis) return fail("Analysis not found.", 404, "NOT_FOUND");

    const body = (await req.json()) as {
      requirement_id?: string;
      verified?: boolean;
      note?: string;
    };

    if (!body.requirement_id || typeof body.requirement_id !== "string") {
      return fail("requirement_id is required.", 400, "MISSING_FIELDS");
    }
    if (typeof body.verified !== "boolean") {
      return fail("verified must be a boolean.", 400, "INVALID_FIELDS");
    }

    const updated = await verifyAnalysisRequirement({
      user,
      analysisId: params.analysisId,
      requirementId: body.requirement_id,
      verified: body.verified,
      note: body.note ?? null,
    });

    if (!updated) {
      return fail("Requirement not found.", 404, "NOT_FOUND");
    }

    return ok({
      requirement_id: body.requirement_id,
      verified: body.verified,
      note: body.verified ? (body.note?.trim() || null) : null,
    });
  });
}
