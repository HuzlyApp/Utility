import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import { assignCandidateRecruiter, getCandidateDetail } from "@/lib/dal/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.assignment.get", async (user) => {
    const candidate = await getCandidateDetail(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");
    return ok({
      candidateId: params.candidateId,
      assignedRecruiterId: candidate.assigned_recruiter_id,
      assignedRecruiterName: candidate.assigned_recruiter_name,
    });
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.assignment.patch", async (user) => {
    try {
      const body = (await req.json()) as { assignedRecruiterId?: string | null };
      const assignedRecruiterId =
        body.assignedRecruiterId === undefined
          ? undefined
          : body.assignedRecruiterId
            ? String(body.assignedRecruiterId)
            : null;
      if (assignedRecruiterId === undefined) {
        return fail("assignedRecruiterId is required (use null to unassign).", 400, "MISSING_ASSIGNEE");
      }

      const result = await assignCandidateRecruiter(
        user,
        params.candidateId,
        assignedRecruiterId
      );
      if (!result) return fail("Candidate not found.", 404, "NOT_FOUND");

      return ok({
        candidateId: params.candidateId,
        changed: result.changed,
        previousRecruiterName: result.previousRecruiterName,
        newRecruiterName: result.newRecruiterName,
        assignedRecruiterId,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
