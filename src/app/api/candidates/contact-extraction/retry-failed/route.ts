import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { retryFailedContactExtractionsBatch } from "@/lib/dal/candidates";
import { canViewCandidateContact } from "@/lib/auth/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bulk retry failed/stale contact extractions.
 * Body: { candidateIds?: string[]; limit?: number }
 */
export async function POST(req: NextRequest) {
  return withTenantUser("candidates.contact.bulk_retry", async (user) => {
    if (!canViewCandidateContact(user.role)) {
      return fail(
        "Not authorized to retry contact extraction.",
        403,
        "FORBIDDEN"
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      candidateIds?: string[];
      limit?: number;
    };
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((id) => typeof id === "string" && id.length > 0)
      : undefined;
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? body.limit
        : 25;

    const result = await retryFailedContactExtractionsBatch(user, {
      candidateIds,
      limit,
    });

    return ok({
      queued: result.queued,
      claimedIds: result.claimedIds,
      message:
        result.queued > 0
          ? `Retrying contact extraction for ${result.queued} candidates…`
          : "No failed contact extractions to retry.",
    });
  });
}
