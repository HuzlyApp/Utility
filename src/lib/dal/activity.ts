import "server-only";
import { getSql } from "./client";
import { AuthError, type AppRole, type AppUser } from "@/lib/auth/session";
import type { CandidateActivityRow } from "./types";
import {
  sourceFromRole,
  type ActivitySource,
  type RecruiterActivityAction,
} from "@/lib/recruiter-activity";

export const CANDIDATE_ACTIVITY_ACTIONS = [
  "USER_LOGIN",
  "CANDIDATE_CREATED",
  "CANDIDATE_IMPORTED",
  "CANDIDATE_ASSIGNED",
  "CANDIDATE_REASSIGNED",
  "RESUME_UPLOADED",
  "RESUME_REPLACED",
  "RESUME_DOWNLOADED",
  "DUPLICATE_WARNING_ACCEPTED",
  "ANALYSIS_STARTED",
  "ANALYSIS_COMPLETED",
  "ANALYSIS_FAILED",
  "ANALYSIS_RERUN",
  "ASSESSMENT_DOWNLOADED",
  "NOTE_ADDED",
  "NOTE_EDITED",
  "NOTE_DELETED",
  "STATUS_CHANGED",
  "CANDIDATE_ADDED_TO_JOB",
  "CANDIDATE_REMOVED_FROM_JOB",
  "CANDIDATE_QUALIFIED",
  "CANDIDATE_SUBMITTED",
  "CANDIDATE_SUBMITTED_TO_JOB",
  "INTERVIEW_SCHEDULED",
  "OFFER_EXTENDED",
  "CANDIDATE_HIRED",
  "CANDIDATE_REJECTED",
  "CANDIDATE_ON_HOLD",
  "CANDIDATE_UNREACHABLE",
  "DISPOSITION_UPDATED",
  "JOB_CREATED",
  "JOB_EDITED",
  "JOB_ARCHIVED",
  "JOB_REOPENED",
] as const;

export type CandidateActivityAction =
  | (typeof CANDIDATE_ACTIVITY_ACTIONS)[number]
  | RecruiterActivityAction
  | string;

export type { CandidateActivityRow };

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

export async function logActivity(params: {
  tenantId: string;
  performedByUserId: string | null;
  actionType: CandidateActivityAction;
  candidateId?: string | null;
  jobId?: string | null;
  analysisId?: string | null;
  noteId?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
  source?: ActivitySource;
  requestId?: string | null;
  actionLabel?: string | null;
  actorRole?: AppRole | null;
}): Promise<boolean> {
  const sql = getSql();
  const source =
    params.source ?? sourceFromRole(params.actorRole) ?? "recruiter";
  const requestId = params.requestId?.trim() || null;

  if (requestId) {
    const inserted = (await sql`
      INSERT INTO candidate_activity_logs (
        tenant_id, candidate_id, job_id, performed_by_user_id,
        action_type, previous_value, new_value, metadata,
        request_id, source, analysis_id, note_id, action_label
      ) VALUES (
        ${params.tenantId},
        ${params.candidateId ?? null},
        ${params.jobId ?? null},
        ${params.performedByUserId},
        ${params.actionType},
        ${params.previousValue ?? null},
        ${params.newValue ?? null},
        ${JSON.stringify(params.metadata ?? {})},
        ${requestId},
        ${source},
        ${params.analysisId ?? null},
        ${params.noteId ?? null},
        ${params.actionLabel ?? null}
      )
      ON CONFLICT (tenant_id, request_id)
      DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;
    return inserted.length > 0;
  }

  await sql`
    INSERT INTO candidate_activity_logs (
      tenant_id, candidate_id, job_id, performed_by_user_id,
      action_type, previous_value, new_value, metadata,
      request_id, source, analysis_id, note_id, action_label
    ) VALUES (
      ${params.tenantId},
      ${params.candidateId ?? null},
      ${params.jobId ?? null},
      ${params.performedByUserId},
      ${params.actionType},
      ${params.previousValue ?? null},
      ${params.newValue ?? null},
      ${JSON.stringify(params.metadata ?? {})},
      ${null},
      ${source},
      ${params.analysisId ?? null},
      ${params.noteId ?? null},
      ${params.actionLabel ?? null}
    )
  `;
  return true;
}

/** @deprecated Prefer logActivity — kept for existing call sites. */
export async function logCandidateActivity(params: {
  tenantId: string;
  candidateId: string;
  performedByUserId: string | null;
  actionType: CandidateActivityAction;
  jobId?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
  analysisId?: string | null;
  noteId?: string | null;
  source?: ActivitySource;
  requestId?: string | null;
  actionLabel?: string | null;
  actorRole?: AppRole | null;
}): Promise<boolean> {
  return logActivity({
    ...params,
    candidateId: params.candidateId,
  });
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

export async function getCandidateActivitySummary(
  user: AppUser,
  candidateId: string
): Promise<{
  recruiterCount: number;
  lastActivityAt: string | null;
  lastActivityByName: string | null;
  lastActivityByUserId: string | null;
}> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT
      COUNT(DISTINCT a.performed_by_user_id) FILTER (
        WHERE a.performed_by_user_id IS NOT NULL AND COALESCE(a.source, 'recruiter') <> 'system'
      ) AS recruiter_count,
      (
        SELECT a2.created_at
        FROM candidate_activity_logs a2
        WHERE a2.candidate_id = ${candidateId}
          AND a2.tenant_id = ${tenantId}
          AND a2.performed_by_user_id IS NOT NULL
          AND COALESCE(a2.source, 'recruiter') <> 'system'
        ORDER BY a2.created_at DESC
        LIMIT 1
      ) AS last_activity_at,
      (
        SELECT up.full_name
        FROM candidate_activity_logs a2
        LEFT JOIN user_profiles up ON up.user_id = a2.performed_by_user_id
        WHERE a2.candidate_id = ${candidateId}
          AND a2.tenant_id = ${tenantId}
          AND a2.performed_by_user_id IS NOT NULL
          AND COALESCE(a2.source, 'recruiter') <> 'system'
        ORDER BY a2.created_at DESC
        LIMIT 1
      ) AS last_activity_by_name,
      (
        SELECT a2.performed_by_user_id
        FROM candidate_activity_logs a2
        WHERE a2.candidate_id = ${candidateId}
          AND a2.tenant_id = ${tenantId}
          AND a2.performed_by_user_id IS NOT NULL
          AND COALESCE(a2.source, 'recruiter') <> 'system'
        ORDER BY a2.created_at DESC
        LIMIT 1
      ) AS last_activity_by_user_id
    FROM candidate_activity_logs a
    WHERE a.candidate_id = ${candidateId}
      AND a.tenant_id = ${tenantId}
  `) as Array<Record<string, unknown>>;

  const r = rows[0] ?? {};
  return {
    recruiterCount: Number(r.recruiter_count ?? 0),
    lastActivityAt: (r.last_activity_at as string) ?? null,
    lastActivityByName: (r.last_activity_by_name as string) ?? null,
    lastActivityByUserId: (r.last_activity_by_user_id as string) ?? null,
  };
}
