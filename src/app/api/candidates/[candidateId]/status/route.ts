import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import { updateCandidateStatus } from "@/lib/dal/candidates";
import { listCandidateStatuses } from "@/lib/dal/statuses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.status.get", async (user) => {
    const statuses = await listCandidateStatuses(user);
    return ok({ statuses, candidateId: params.candidateId });
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.status.patch", async (user) => {
    try {
      const body = (await req.json()) as { statusId?: string };
      const statusId = (body.statusId ?? "").trim();
      if (!statusId) return fail("statusId is required.", 400, "MISSING_STATUS");

      const result = await updateCandidateStatus(user, params.candidateId, statusId);
      if (!result) return fail("Candidate not found.", 404, "NOT_FOUND");

      return ok({
        candidateId: params.candidateId,
        changed: result.changed,
        statusId: result.statusId,
        previousStatusName: result.previousStatusName,
        newStatusName: result.newStatusName,
        changedAt: result.changedAt,
        changedByName: result.changedByName,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
