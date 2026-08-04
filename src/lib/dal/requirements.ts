import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import { AuthError, type AppUser } from "@/lib/auth/session";

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

export interface AnalysisRequirementRow {
  id: string;
  requirement_text: string;
  requirement_type: string | null;
  recruiter_verified: boolean;
  recruiter_verification_note: string | null;
}

export async function listAnalysisRequirements(
  user: AppUser,
  analysisId: string
): Promise<AnalysisRequirementRow[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT r.id::text AS id,
           r.requirement_text,
           r.requirement_type,
           COALESCE(r.recruiter_verified, false) AS recruiter_verified,
           r.recruiter_verification_note
    FROM candidate_match_requirements r
    JOIN candidate_match_analyses a ON a.id = r.analysis_id
    WHERE r.analysis_id = ${analysisId}
      AND a.tenant_id = ${tenantId}
    ORDER BY r.created_at ASC
  `) as AnalysisRequirementRow[];
  return rows;
}

export async function verifyAnalysisRequirement(params: {
  user: AppUser;
  analysisId: string;
  requirementId: string;
  verified: boolean;
  note?: string | null;
}): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(params.user);
  const note =
    params.note != null && params.note.trim().length > 0
      ? params.note.trim()
      : null;

  const rows = (await sql`
    UPDATE candidate_match_requirements r
    SET recruiter_verified = ${params.verified},
        recruiter_verification_note = ${params.verified ? note : null},
        updated_at = now()
    FROM candidate_match_analyses a
    WHERE r.id = ${params.requirementId}
      AND r.analysis_id = ${params.analysisId}
      AND a.id = r.analysis_id
      AND a.tenant_id = ${tenantId}
    RETURNING r.id
  `) as { id: string }[];

  if (rows.length === 0) return false;

  await audit({
    actorUserId: params.user.id,
    tenantId,
    entityType: "analysis",
    entityId: params.analysisId,
    action: "REQUIREMENT_VERIFIED",
    newValue: {
      requirementId: params.requirementId,
      verified: params.verified,
      note,
    },
  });

  return true;
}

/** Copy recruiter verification flags onto newly inserted rows by matching requirement text. */
export async function copyRequirementVerifications(params: {
  fromAnalysisId: string;
  toAnalysisId: string;
}): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE candidate_match_requirements dest
    SET recruiter_verified = src.recruiter_verified,
        recruiter_verification_note = src.recruiter_verification_note,
        updated_at = now()
    FROM candidate_match_requirements src
    WHERE dest.analysis_id = ${params.toAnalysisId}
      AND src.analysis_id = ${params.fromAnalysisId}
      AND src.requirement_text = dest.requirement_text
      AND COALESCE(src.recruiter_verified, false) = true
    RETURNING dest.id
  `) as { id: string }[];
  return rows.length;
}
