import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { getCandidate } from "@/lib/dal/candidates";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import {
  buildContactExtractionApiSummary,
  hasCompleteContactDetails,
} from "@/lib/contact-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll a single candidate's contact extraction state. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.contact.status", async (user) => {
    if (!canViewCandidateContact(user.role)) {
      return fail("Not authorized to view contact details.", 403, "FORBIDDEN");
    }
    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");

    const summary = buildContactExtractionApiSummary({
      status: candidate.contact_extraction_status,
      attempts: candidate.contact_extraction_attempts,
      startedAt: candidate.contact_extraction_started_at,
      completedAt: candidate.contact_extraction_completed_at,
    });

    return ok({
      candidate_id: candidate.id,
      phone_number: candidate.phone,
      email: candidate.email,
      phone: {
        value: candidate.phone,
        status: candidate.phone?.trim()
          ? "completed"
          : summary.status === "failed" || summary.status === "stale"
            ? summary.status
            : summary.status === "completed" || summary.status === "not_found"
              ? "not_found"
              : summary.status,
      },
      email_field: {
        value: candidate.email,
        status: candidate.email?.trim()
          ? "completed"
          : summary.status === "failed" || summary.status === "stale"
            ? summary.status
            : summary.status === "completed" || summary.status === "not_found"
              ? "not_found"
              : summary.status,
      },
      contact_extraction: summary,
      complete: hasCompleteContactDetails(candidate),
    });
  });
}
