import "server-only";
import { getSql } from "./client";
import { AuthError, type AppUser } from "@/lib/auth/session";
import type { CandidateActivityRow } from "./types";

export const CANDIDATE_ACTIVITY_ACTIONS = [
  "CANDIDATE_CREATED",
  "RESUME_UPLOADED",
  "RESUME_REPLACED",
  "DUPLICATE_WARNING_ACCEPTED",
  "ANALYSIS_STARTED",
  "ANALYSIS_COMPLETED",
  "ANALYSIS_RERUN",
  "STATUS_CHANGED",
  "NOTE_ADDED",
  "NOTE_EDITED",
  "NOTE_DELETED",
  "CANDIDATE_ASSIGNED",
  "CANDIDATE_SUBMITTED_TO_JOB",
  "DISPOSITION_UPDATED",
] as const;

export type CandidateActivityAction = (typeof CANDIDATE_ACTIVITY_ACTIONS)[number];

export type { CandidateActivityRow };

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

export async function logCandidateActivity(params: {
  tenantId: string;
  candidateId: string;
  performedByUserId: string | null;
  actionType: CandidateActivityAction | string;
  jobId?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO candidate_activity_logs (
      tenant_id, candidate_id, job_id, performed_by_user_id,
      action_type, previous_value, new_value, metadata
    ) VALUES (
      ${params.tenantId},
      ${params.candidateId},
      ${params.jobId ?? null},
      ${params.performedByUserId},
      ${params.actionType},
      ${params.previousValue ?? null},
      ${params.newValue ?? null},
      ${JSON.stringify(params.metadata ?? {})}
    )
  `;
}

export async function listCandidateActivity(
  user: AppUser,
  candidateId: string
): Promise<CandidateActivityRow[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT
      a.id, a.tenant_id, a.candidate_id, a.job_id, a.performed_by_user_id,
      up.full_name AS performer_name,
      a.action_type, a.previous_value, a.new_value, a.metadata, a.created_at
    FROM candidate_activity_logs a
    JOIN candidates c ON c.id = a.candidate_id AND c.tenant_id = a.tenant_id
    LEFT JOIN user_profiles up ON up.user_id = a.performed_by_user_id
    WHERE a.candidate_id = ${candidateId}
      AND a.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
    ORDER BY a.created_at DESC
  `) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    candidate_id: r.candidate_id as string,
    job_id: (r.job_id as string) ?? null,
    performed_by_user_id: (r.performed_by_user_id as string) ?? null,
    performer_name: (r.performer_name as string) ?? null,
    action_type: r.action_type as string,
    previous_value: (r.previous_value as string) ?? null,
    new_value: (r.new_value as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    created_at: r.created_at as string,
  }));
}
