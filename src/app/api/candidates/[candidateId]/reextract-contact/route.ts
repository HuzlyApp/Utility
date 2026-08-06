import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import {
  applyResumeContactExtraction,
  getCandidate,
} from "@/lib/dal/candidates";
import {
  CONTACT_EXTRACTION_MAX_ATTEMPTS,
  canRetryContactExtraction,
} from "@/lib/contact-extract";
import { getSql } from "@/lib/dal/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-extract phone/email from stored résumé text.
 * Body: { force?: boolean } — force overwrites manual corrections.
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

      if (
        !force &&
        !canRetryContactExtraction({
          status: candidate.contact_extraction_status,
          attempts,
          startedAt: candidate.contact_extraction_started_at,
        }) &&
        attempts >= CONTACT_EXTRACTION_MAX_ATTEMPTS
      ) {
        return fail(
          "Maximum contact extraction attempts reached.",
          429,
          "MAX_ATTEMPTS"
        );
      }

      if (!candidate.extracted_resume_text?.trim()) {
        return fail(
          "No résumé text available to extract contact details from.",
          400,
          "NO_RESUME_TEXT"
        );
      }

      // Reset to pending before the attempt so UI never stays on a prior failure.
      const sql = getSql();
      if (!user.tenantId) {
        return fail("Tenant context is required.", 403, "FORBIDDEN");
      }
      await sql`
        UPDATE candidates SET
          contact_extraction_status = ${"pending"},
          contact_extraction_error = ${null},
          updated_at = now()
        WHERE id = ${params.candidateId} AND tenant_id = ${user.tenantId}
      `;

      const result = await applyResumeContactExtraction(
        user,
        params.candidateId,
        candidate.extracted_resume_text,
        { force }
      );

      return ok({
        candidateId: params.candidateId,
        status: result.status,
        email: result.email,
        phone: result.phone,
        attempts: result.attempts,
        error: result.error,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
