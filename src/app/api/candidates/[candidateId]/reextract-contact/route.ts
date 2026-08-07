import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import {
  getCandidate,
  retryCandidateContactExtraction,
} from "@/lib/dal/candidates";
import {
  CONTACT_EXTRACTION_MAX_ATTEMPTS,
  buildContactExtractionApiSummary,
  canRetryContactExtraction,
  hasCompleteContactDetails,
} from "@/lib/contact-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manually retry contact extraction from the stored résumé file(s).
 * Re-reads file bytes when available, re-parses text, then extracts email/phone.
 * Body: { force?: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.contact.reextract", async (user) => {
    if (!canViewCandidateContact(user.role)) {
      return fail("Not authorized to re-extract contact details.", 403, "FORBIDDEN");
    }
    try {
      const candidate = await getCandidate(user, params.candidateId);
      if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");

      const body = (await req.json().catch(() => ({}))) as { force?: boolean };
      const force = Boolean(body.force);
      const attempts = Number(candidate.contact_extraction_attempts ?? 0);

      if (hasCompleteContactDetails(candidate) && !force) {
        const summary = buildContactExtractionApiSummary({
          status: "completed",
          attempts,
          startedAt: candidate.contact_extraction_started_at,
          completedAt: candidate.contact_extraction_completed_at,
        });
        return ok({
          candidate_id: params.candidateId,
          candidateId: params.candidateId,
          status: "completed",
          attempt: attempts,
          email: candidate.email,
          phone: candidate.phone,
          phone_number: candidate.phone,
          attempts,
          error: null,
          contact_extraction: summary,
          deduplicated: true,
          resume_reloaded: false,
        });
      }

      if (
        !force &&
        !canRetryContactExtraction({
          status: candidate.contact_extraction_status,
          attempts,
          startedAt: candidate.contact_extraction_started_at,
          force,
        }) &&
        attempts >= CONTACT_EXTRACTION_MAX_ATTEMPTS
      ) {
        return fail(
          "Maximum contact extraction attempts reached.",
          429,
          "MAX_ATTEMPTS"
        );
      }

      const result = await retryCandidateContactExtraction(
        user,
        params.candidateId,
        { force }
      );

      const summary = buildContactExtractionApiSummary({
        status: result.status,
        attempts: result.attempts,
        completedAt: new Date().toISOString(),
      });

      return ok({
        candidate_id: params.candidateId,
        candidateId: params.candidateId,
        status: result.status,
        attempt: result.attempts,
        email: result.email,
        phone: result.phone,
        phone_number: result.phone,
        attempts: result.attempts,
        error: result.error,
        contact_extraction: summary,
        deduplicated: result.deduplicated,
        resume_reloaded: result.resumeReloaded,
        file_type: result.fileType,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
