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
      const body = (await req.json()) as { statusId?: string; note?: string | null };
      const statusId = (body.statusId ?? "").trim();
      if (!statusId) return fail("statusId is required.", 400, "MISSING_STATUS");

      const note =
        typeof body.note === "string" ? body.note : body.note == null ? null : undefined;
      if (note === undefined && body.note !== undefined) {
        return fail("note must be a string.", 400, "INVALID_NOTE");
      }

      const result = await updateCandidateStatus(
        user,
        params.candidateId,
        statusId,
        note ?? null
      );
      if (!result) return fail("Candidate not found.", 404, "NOT_FOUND");

      return ok({
        candidateId: params.candidateId,
        changed: result.changed,
        statusId: result.statusId,
        previousStatusName: result.previousStatusName,
        newStatusName: result.newStatusName,
        changedAt: result.changedAt,
        changedByName: result.changedByName,
        note: result.note,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
