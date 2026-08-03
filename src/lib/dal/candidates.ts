import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import { logCandidateActivity } from "./activity";
import { getDefaultStatusId, getStatusById } from "./statuses";
import { AuthError, type AppUser } from "@/lib/auth/session";
import type { VerifiedRecruiterInputs } from "@/lib/types";
import { normalizeCandidateName } from "@/lib/duplicate-candidate/normalize";
import type {
  Candidate,
  CandidatePipelineStatus,
  RankedCandidateRow,
} from "./types";

export interface CandidateInput {
  full_name?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  location?: string;
  extracted_resume_text?: string;
  ocr_confidence?: number | null;
  extraction_quality?: string;
  recruiter_notes?: string;
  verified_information?: VerifiedRecruiterInputs;
}

const num = (v: unknown) => (v == null ? null : Number(v));

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

export async function createCandidate(
  user: AppUser,
  input: CandidateInput
): Promise<string> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const normalizedName = input.full_name
    ? normalizeCandidateName(input.full_name) || null
    : null;
  const defaultStatusId = await getDefaultStatusId(tenantId);
  const rows = (await sql`
    INSERT INTO candidates (
      owner_user_id, tenant_id, full_name, normalized_full_name, email, phone, specialty, location,
      extracted_resume_text, ocr_confidence, extraction_quality, recruiter_notes,
      verified_information, created_by, created_by_user_id, updated_by_user_id,
      current_status_id, assigned_recruiter_id
    ) VALUES (
      ${user.id}, ${tenantId}, ${input.full_name ?? null}, ${normalizedName}, ${input.email ?? null},
      ${input.phone ?? null}, ${input.specialty ?? null}, ${input.location ?? null},
      ${input.extracted_resume_text ?? null}, ${input.ocr_confidence ?? null},
      ${input.extraction_quality ?? null}, ${input.recruiter_notes ?? null},
      ${JSON.stringify(input.verified_information ?? {})}, ${user.id}, ${user.id}, ${user.id},
      ${defaultStatusId}, ${user.id}
    ) RETURNING id
  `) as { id: string }[];
  const id = rows[0].id;
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: id,
    action: "CANDIDATE_CREATED",
    newValue: { full_name: input.full_name },
  });
  await logCandidateActivity({
    tenantId,
    candidateId: id,
    performedByUserId: user.id,
    actionType: "CANDIDATE_CREATED",
    newValue: input.full_name ?? null,
  });
  if (input.extracted_resume_text) {
    await logCandidateActivity({
      tenantId,
      candidateId: id,
      performedByUserId: user.id,
      actionType: "RESUME_UPLOADED",
    });
  }
  return id;
}

export async function getCandidate(
  user: AppUser,
  id: string
): Promise<Candidate | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT * FROM candidates WHERE id = ${id} AND tenant_id = ${tenantId}
  `) as Candidate[];
  return rows[0] ?? null;
}

export async function updateCandidate(
  user: AppUser,
  id: string,
  input: CandidateInput
): Promise<boolean> {
  const existing = await getCandidate(user, id);
  if (!existing) return false;
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const nextName = input.full_name ?? existing.full_name;
  const normalizedName = nextName ? normalizeCandidateName(nextName) || null : null;
  await sql`
    UPDATE candidates SET
      full_name = ${nextName},
      normalized_full_name = ${normalizedName},
      email = ${input.email ?? existing.email},
      phone = ${input.phone ?? existing.phone},
      specialty = ${input.specialty ?? existing.specialty},
      location = ${input.location ?? existing.location},
      extracted_resume_text = ${input.extracted_resume_text ?? existing.extracted_resume_text},
      ocr_confidence = ${input.ocr_confidence ?? existing.ocr_confidence},
      extraction_quality = ${input.extraction_quality ?? existing.extraction_quality},
      recruiter_notes = ${input.recruiter_notes ?? existing.recruiter_notes},
      verified_information = ${JSON.stringify(
        input.verified_information ?? existing.verified_information
      )},
      updated_by_user_id = ${user.id},
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
  `;
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: id,
    action: "CANDIDATE_UPDATED",
  });
  return true;
}

export interface CandidateDetailRow extends Candidate {
  status_name: string | null;
  status_color: string | null;
  assigned_recruiter_name: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  last_status_changed_by_name: string | null;
  notes_count: number;
}

export async function getCandidateDetail(
  user: AppUser,
  id: string
): Promise<CandidateDetailRow | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT
      c.*,
      cs.name AS status_name,
      cs.color AS status_color,
      COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
      COALESCE(cb.full_name, cb.email) AS created_by_name,
      COALESCE(ub.full_name, ub.email) AS updated_by_name,
      COALESCE(sb.full_name, sb.email) AS last_status_changed_by_name,
      (
        SELECT COUNT(*)::int FROM candidate_notes n
        WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
      ) AS notes_count
    FROM candidates c
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
    LEFT JOIN user_profiles cb ON cb.user_id = COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id)
    LEFT JOIN user_profiles ub ON ub.user_id = c.updated_by_user_id
    LEFT JOIN user_profiles sb ON sb.user_id = c.last_status_changed_by_user_id
    WHERE c.id = ${id} AND c.tenant_id = ${tenantId}
  `) as CandidateDetailRow[];
  return rows[0] ?? null;
}

export async function updateCandidateStatus(
  user: AppUser,
  candidateId: string,
  statusId: string
): Promise<{
  changed: boolean;
  previousStatusName: string | null;
  newStatusName: string | null;
  statusId: string;
  changedAt: string;
  changedByName: string | null;
} | null> {
  const existing = await getCandidateDetail(user, candidateId);
  if (!existing) return null;

  const next = await getStatusById(user, statusId);
  if (!next || !next.is_active) {
    throw new AuthError("Invalid or inactive status.", 400);
  }

  if (existing.current_status_id === statusId) {
    return {
      changed: false,
      previousStatusName: existing.status_name,
      newStatusName: next.name,
      statusId,
      changedAt: existing.last_status_changed_at ?? existing.updated_at,
      changedByName: existing.last_status_changed_by_name,
    };
  }

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    UPDATE candidates SET
      current_status_id = ${statusId},
      last_status_changed_by_user_id = ${user.id},
      last_status_changed_at = now(),
      updated_by_user_id = ${user.id},
      updated_at = now()
    WHERE id = ${candidateId} AND tenant_id = ${tenantId}
    RETURNING last_status_changed_at
  `) as { last_status_changed_at: string }[];

  await logCandidateActivity({
    tenantId,
    candidateId,
    performedByUserId: user.id,
    actionType: "STATUS_CHANGED",
    previousValue: existing.status_name,
    newValue: next.name,
    metadata: {
      previous_status_id: existing.current_status_id,
      new_status_id: statusId,
    },
  });
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: candidateId,
    action: "STATUS_CHANGED",
    previousValue: { status_id: existing.current_status_id, name: existing.status_name },
    newValue: { status_id: statusId, name: next.name },
  });

  return {
    changed: true,
    previousStatusName: existing.status_name,
    newStatusName: next.name,
    statusId,
    changedAt: rows[0].last_status_changed_at,
    changedByName: user.name,
  };
}

export async function assignCandidateRecruiter(
  user: AppUser,
  candidateId: string,
  recruiterUserId: string | null
): Promise<{
  changed: boolean;
  previousRecruiterName: string | null;
  newRecruiterName: string | null;
} | null> {
  const existing = await getCandidateDetail(user, candidateId);
  if (!existing) return null;

  if (existing.assigned_recruiter_id === recruiterUserId) {
    return {
      changed: false,
      previousRecruiterName: existing.assigned_recruiter_name,
      newRecruiterName: existing.assigned_recruiter_name,
    };
  }

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  let newName: string | null = null;

  if (recruiterUserId) {
    const recruiters = (await sql`
      SELECT user_id, COALESCE(full_name, email) AS name
      FROM user_profiles
      WHERE user_id = ${recruiterUserId}
        AND tenant_id = ${tenantId}
        AND status = 'ACTIVE'
    `) as { user_id: string; name: string | null }[];
    if (!recruiters[0]) {
      throw new AuthError("Assigned recruiter must belong to this tenant.", 400);
    }
    newName = recruiters[0].name;
  }

  await sql`
    UPDATE candidates SET
      assigned_recruiter_id = ${recruiterUserId},
      updated_by_user_id = ${user.id},
      updated_at = now()
    WHERE id = ${candidateId} AND tenant_id = ${tenantId}
  `;

  await logCandidateActivity({
    tenantId,
    candidateId,
    performedByUserId: user.id,
    actionType: "CANDIDATE_ASSIGNED",
    previousValue: existing.assigned_recruiter_name,
    newValue: newName ?? "Unassigned",
    metadata: {
      previous_recruiter_id: existing.assigned_recruiter_id,
      new_recruiter_id: recruiterUserId,
    },
  });
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: candidateId,
    action: "CANDIDATE_ASSIGNED",
    previousValue: { recruiter_id: existing.assigned_recruiter_id },
    newValue: { recruiter_id: recruiterUserId },
  });

  return {
    changed: true,
    previousRecruiterName: existing.assigned_recruiter_name,
    newRecruiterName: newName,
  };
}

export async function attachCandidateToWorkspace(
  user: AppUser,
  workspaceId: string,
  candidateId: string,
  status: CandidatePipelineStatus
): Promise<string> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    INSERT INTO job_match_candidates (workspace_id, candidate_id, owner_user_id, status)
    VALUES (${workspaceId}, ${candidateId}, ${user.id}, ${status})
    ON CONFLICT (workspace_id, candidate_id)
    DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    RETURNING id
  `) as { id: string }[];
  await sql`
    UPDATE job_match_candidates
    SET owner_user_id = ${user.id}
    WHERE id = ${rows[0].id}
      AND EXISTS (
        SELECT 1 FROM job_match_workspaces w
        WHERE w.id = ${workspaceId} AND w.tenant_id = ${tenantId}
      )
  `;
  await logCandidateActivity({
    tenantId,
    candidateId,
    jobId: workspaceId,
    performedByUserId: user.id,
    actionType: "CANDIDATE_SUBMITTED_TO_JOB",
    newValue: workspaceId,
  });
  return rows[0].id;
}

export async function getJobCandidate(
  user: AppUser,
  workspaceId: string,
  candidateId: string
): Promise<{
  id: string;
  status: CandidatePipelineStatus;
  latest_analysis_id: string | null;
  updated_at: string;
} | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT jmc.id, jmc.status, jmc.latest_analysis_id, jmc.updated_at
    FROM job_match_candidates jmc
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidates c ON c.id = jmc.candidate_id
    WHERE jmc.workspace_id = ${workspaceId}
      AND jmc.candidate_id = ${candidateId}
      AND w.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
  `) as Array<{
    id: string;
    status: CandidatePipelineStatus;
    latest_analysis_id: string | null;
    updated_at: string;
  }>;
  return rows[0] ?? null;
}

/** Release an ANALYZING lock after a crash, timeout, or explicit retry. */
export async function releaseAnalyzingLock(
  user: AppUser,
  jobMatchCandidateId: string,
  options: { force?: boolean; staleAfterMs?: number } = {}
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const staleAfterMs = options.staleAfterMs ?? 5 * 60 * 1000;

  if (options.force) {
    const rows = (await sql`
      UPDATE job_match_candidates
      SET status = 'FAILED', updated_at = now()
      WHERE id = ${jobMatchCandidateId}
        AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
        AND status = 'ANALYZING'
      RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  const rows = (await sql`
    UPDATE job_match_candidates
    SET status = 'FAILED', updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
      AND status = 'ANALYZING'
      AND updated_at < now() - (${staleAfterMs} * interval '1 millisecond')
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

/** Release a stuck resume-update / reanalyze lock after crash, timeout, or retry. */
export async function releaseResumeUpdateLock(
  user: AppUser,
  jobMatchCandidateId: string,
  options: { force?: boolean; staleAfterMs?: number } = {}
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const staleAfterMs = options.staleAfterMs ?? 5 * 60 * 1000;

  if (options.force) {
    const rows = (await sql`
      UPDATE job_match_candidates
      SET status = 'UPDATE_FAILED', updated_at = now()
      WHERE id = ${jobMatchCandidateId}
        AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
        AND status IN (
          'UPDATE_PENDING',
          'EXTRACTING_UPDATED_RESUME',
          'REANALYZING',
          'VALIDATING',
          'SAVING',
          'ANALYZING'
        )
      RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  const rows = (await sql`
    UPDATE job_match_candidates
    SET status = 'UPDATE_FAILED', updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
      AND status IN (
        'UPDATE_PENDING',
        'EXTRACTING_UPDATED_RESUME',
        'REANALYZING',
        'VALIDATING',
        'SAVING',
        'ANALYZING'
      )
      AND updated_at < now() - (${staleAfterMs} * interval '1 millisecond')
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function setJobCandidateStatus(
  user: AppUser,
  jobMatchCandidateId: string,
  status: CandidatePipelineStatus
): Promise<void> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  await sql`
    UPDATE job_match_candidates SET status = ${status}, updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
  `;
}

export async function setLatestAnalysis(
  user: AppUser,
  jobMatchCandidateId: string,
  analysisId: string
): Promise<void> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  await sql`
    UPDATE job_match_candidates
    SET latest_analysis_id = ${analysisId}, status = 'ANALYZED', updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
  `;
}

export async function removeCandidateFromJob(
  user: AppUser,
  workspaceId: string,
  candidateId: string
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    DELETE FROM job_match_candidates
    WHERE workspace_id = ${workspaceId} AND candidate_id = ${candidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
    RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return false;
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: candidateId,
    action: "CANDIDATE_REMOVED_FROM_JOB",
    newValue: { workspaceId },
  });
  return true;
}

export interface DashboardCandidateRow {
  candidate_id: string;
  full_name: string | null;
  specialty: string | null;
  location: string | null;
  workspace_id: string | null;
  job_title: string | null;
  match_score: number | null;
  match_category: string | null;
  submission_readiness: string | null;
  updated_at: string;
  current_status_id: string | null;
  status_name: string | null;
  status_color: string | null;
  assigned_recruiter_id: string | null;
  assigned_recruiter_name: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  notes_count: number;
}

export interface DashboardCandidateFilters {
  matchCategory?: string;
  submissionReadiness?: string;
  statusId?: string;
  assignedRecruiterId?: string | null;
  createdByUserId?: string;
  updatedByUserId?: string;
  workspaceId?: string;
  dateFrom?: string;
  dateTo?: string;
  mine?: boolean;
}

/**
 * Candidates for the dashboard list page. When a match filter is set, returns
 * job-match rows whose latest analysis matches the dashboard statistic.
 */
export async function listDashboardCandidates(
  user: AppUser,
  opts?: DashboardCandidateFilters
): Promise<DashboardCandidateRow[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const matchCategory = opts?.matchCategory ?? null;
  const submissionReadiness = opts?.submissionReadiness ?? null;
  const statusId = opts?.statusId ?? null;
  const assignedRecruiterId =
    opts?.mine ? user.id : (opts?.assignedRecruiterId ?? null);
  const unassignedOnly = opts?.assignedRecruiterId === null && !opts?.mine;
  const createdByUserId = opts?.createdByUserId ?? null;
  const updatedByUserId = opts?.updatedByUserId ?? null;
  const workspaceId = opts?.workspaceId ?? null;
  const dateFrom = opts?.dateFrom ?? null;
  const dateTo = opts?.dateTo ?? null;
  const analysisFiltered = Boolean(matchCategory || submissionReadiness);

  if (!analysisFiltered) {
    const rows = (await sql`
      SELECT
        c.id AS candidate_id,
        c.full_name,
        c.specialty,
        c.location,
        (
          SELECT jmc.workspace_id
          FROM job_match_candidates jmc
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS workspace_id,
        (
          SELECT w.job_title
          FROM job_match_candidates jmc
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS job_title,
        (
          SELECT a.overall_match_score
          FROM job_match_candidates jmc
          LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS match_score,
        (
          SELECT a.match_category
          FROM job_match_candidates jmc
          LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS match_category,
        (
          SELECT a.submission_readiness
          FROM job_match_candidates jmc
          LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS submission_readiness,
        c.updated_at,
        c.current_status_id,
        cs.name AS status_name,
        cs.color AS status_color,
        c.assigned_recruiter_id,
        COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
        c.updated_by_user_id,
        COALESCE(ub.full_name, ub.email) AS updated_by_name,
        COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) AS created_by_user_id,
        COALESCE(cb.full_name, cb.email) AS created_by_name,
        (
          SELECT COUNT(*)::int FROM candidate_notes n
          WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
        ) AS notes_count
      FROM candidates c
      LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
      LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
      LEFT JOIN user_profiles ub ON ub.user_id = c.updated_by_user_id
      LEFT JOIN user_profiles cb ON cb.user_id = COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id)
      WHERE c.tenant_id = ${tenantId}
        AND (${statusId}::uuid IS NULL OR c.current_status_id = ${statusId}::uuid)
        AND (
          ${unassignedOnly} = false
          OR c.assigned_recruiter_id IS NULL
        )
        AND (
          ${assignedRecruiterId}::uuid IS NULL
          OR c.assigned_recruiter_id = ${assignedRecruiterId}::uuid
        )
        AND (
          ${createdByUserId}::uuid IS NULL
          OR COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) = ${createdByUserId}::uuid
        )
        AND (
          ${updatedByUserId}::uuid IS NULL
          OR c.updated_by_user_id = ${updatedByUserId}::uuid
        )
        AND (
          ${workspaceId}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM job_match_candidates jmc
            WHERE jmc.candidate_id = c.id AND jmc.workspace_id = ${workspaceId}::uuid
          )
        )
        AND (${dateFrom}::timestamptz IS NULL OR c.updated_at >= ${dateFrom}::timestamptz)
        AND (${dateTo}::timestamptz IS NULL OR c.updated_at <= ${dateTo}::timestamptz)
      ORDER BY c.updated_at DESC
    `) as DashboardCandidateRow[];
    return rows;
  }

  const rows = (await sql`
    SELECT
      c.id AS candidate_id,
      c.full_name,
      c.specialty,
      c.location,
      jmc.workspace_id,
      w.job_title,
      a.overall_match_score AS match_score,
      a.match_category,
      a.submission_readiness,
      jmc.updated_at,
      c.current_status_id,
      cs.name AS status_name,
      cs.color AS status_color,
      c.assigned_recruiter_id,
      COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
      c.updated_by_user_id,
      COALESCE(ub.full_name, ub.email) AS updated_by_name,
      COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) AS created_by_user_id,
      COALESCE(cb.full_name, cb.email) AS created_by_name,
      (
        SELECT COUNT(*)::int FROM candidate_notes n
        WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
      ) AS notes_count
    FROM job_match_candidates jmc
    JOIN candidates c ON c.id = jmc.candidate_id
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
    LEFT JOIN user_profiles ub ON ub.user_id = c.updated_by_user_id
    LEFT JOIN user_profiles cb ON cb.user_id = COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id)
    WHERE w.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
      AND (${matchCategory}::text IS NULL OR a.match_category = ${matchCategory})
      AND (${submissionReadiness}::text IS NULL OR a.submission_readiness = ${submissionReadiness})
      AND (${statusId}::uuid IS NULL OR c.current_status_id = ${statusId}::uuid)
      AND (
        ${unassignedOnly} = false
        OR c.assigned_recruiter_id IS NULL
      )
      AND (
        ${assignedRecruiterId}::uuid IS NULL
        OR c.assigned_recruiter_id = ${assignedRecruiterId}::uuid
      )
      AND (
        ${createdByUserId}::uuid IS NULL
        OR COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) = ${createdByUserId}::uuid
      )
      AND (
        ${updatedByUserId}::uuid IS NULL
        OR c.updated_by_user_id = ${updatedByUserId}::uuid
      )
      AND (${workspaceId}::uuid IS NULL OR jmc.workspace_id = ${workspaceId}::uuid)
      AND (${dateFrom}::timestamptz IS NULL OR c.updated_at >= ${dateFrom}::timestamptz)
      AND (${dateTo}::timestamptz IS NULL OR c.updated_at <= ${dateTo}::timestamptz)
    ORDER BY a.overall_match_score DESC NULLS LAST, c.full_name ASC
  `) as DashboardCandidateRow[];
  return rows;
}

// Resolves a workspace this candidate belongs to (used when the detail page is
// opened without an explicit workspace query).
export async function getPrimaryWorkspaceId(
  user: AppUser,
  candidateId: string
): Promise<string | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT workspace_id FROM job_match_candidates
    WHERE candidate_id = ${candidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
    ORDER BY created_at ASC LIMIT 1
  `) as { workspace_id: string }[];
  return rows[0]?.workspace_id ?? null;
}

// Ranking table rows for a workspace (spec §10), sorted best-first.
export async function listWorkspaceCandidates(
  user: AppUser,
  workspaceId: string
): Promise<RankedCandidateRow[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT
      jmc.id AS job_match_candidate_id,
      jmc.candidate_id,
      c.full_name,
      jmc.status,
      jmc.latest_analysis_id,
      a.overall_match_score AS match_score,
      a.match_category,
      a.submission_readiness,
      a.recommended_action,
      a.confidence_score,
      a.created_at AS analyzed_at,
      a.ai_provider,
      COALESCE(a.ai_model, a.model_name) AS ai_model,
      jmc.updated_at,
      d.disposition,
      c.current_status_id,
      cs.name AS status_name,
      cs.color AS status_color,
      COALESCE(sb.full_name, sb.email) AS last_status_changed_by_name,
      c.last_status_changed_at,
      COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
      (
        SELECT COUNT(*)::int FROM candidate_notes n
        WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
      ) AS notes_count,
      (SELECT COUNT(*) FROM candidate_match_requirements r
        WHERE r.analysis_id = a.id AND r.requirement_type = 'MANDATORY'
          AND r.requirement_outcome = 'MET') AS mandatory_confirmed,
      (SELECT COUNT(*) FROM candidate_match_requirements r
        WHERE r.analysis_id = a.id AND r.requirement_type = 'MANDATORY'
          AND r.requirement_outcome IN ('VERIFY', 'CONFLICT')) AS mandatory_verify,
      (SELECT COUNT(*) FROM candidate_match_requirements r
        WHERE r.analysis_id = a.id AND r.requirement_type = 'MANDATORY'
          AND r.requirement_outcome = 'NOT_MET') AS mandatory_not_met
    FROM job_match_candidates jmc
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidates c ON c.id = jmc.candidate_id
    LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    LEFT JOIN user_profiles sb ON sb.user_id = c.last_status_changed_by_user_id
    LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
    LEFT JOIN LATERAL (
      SELECT disposition FROM recruiter_dispositions rd
      WHERE rd.candidate_id = jmc.candidate_id AND rd.workspace_id = jmc.workspace_id
      ORDER BY created_at DESC LIMIT 1
    ) d ON true
    WHERE jmc.workspace_id = ${workspaceId}
      AND w.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
    ORDER BY a.overall_match_score DESC NULLS LAST, c.full_name ASC
  `) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    job_match_candidate_id: r.job_match_candidate_id as string,
    candidate_id: r.candidate_id as string,
    full_name: (r.full_name as string) ?? null,
    status: r.status as CandidatePipelineStatus,
    latest_analysis_id: (r.latest_analysis_id as string) ?? null,
    match_score: num(r.match_score),
    match_category: (r.match_category as string) ?? null,
    submission_readiness: (r.submission_readiness as string) ?? null,
    recommended_action: (r.recommended_action as string) ?? null,
    confidence_score: num(r.confidence_score),
    mandatory_confirmed: num(r.mandatory_confirmed),
    mandatory_verify: num(r.mandatory_verify),
    mandatory_not_met: num(r.mandatory_not_met),
    disposition: (r.disposition as string) ?? null,
    analyzed_at: (r.analyzed_at as string) ?? null,
    updated_at: r.updated_at as string,
    ai_provider: (r.ai_provider as string) ?? null,
    ai_model: (r.ai_model as string) ?? null,
    current_status_id: (r.current_status_id as string) ?? null,
    status_name: (r.status_name as string) ?? null,
    status_color: (r.status_color as string) ?? null,
    last_status_changed_by_name: (r.last_status_changed_by_name as string) ?? null,
    last_status_changed_at: (r.last_status_changed_at as string) ?? null,
    assigned_recruiter_name: (r.assigned_recruiter_name as string) ?? null,
    notes_count: Number(r.notes_count ?? 0),
  }));
}
