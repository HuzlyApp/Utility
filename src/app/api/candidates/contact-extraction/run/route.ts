import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { processEligibleContactExtractions } from "@/lib/dal/candidates";
import { canViewCandidateContact } from "@/lib/auth/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Queue + process eligible resume contact extractions in the background.
 * Body: { candidateIds?: string[]; limit?: number }
 *
 * Idempotent: skips candidates already processing/completed/not_found and
 * respects the max-attempt policy. Does not block the Candidates page SSR.
 */
export async function POST(req: NextRequest) {
  return withTenantUser("candidates.contact.backfill", async (user) => {
    if (!canViewCandidateContact(user.role)) {
      return fail(
        "Not authorized to run contact extraction.",
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
        : candidateIds?.length
          ? Math.min(Math.max(candidateIds.length, 8), 40)
          : 25;

    const result = await processEligibleContactExtractions(user, {
      candidateIds,
      limit,
    });

    return ok({
      processed: result.processed,
      claimedIds: result.claimedIds,
    });
  });
}
