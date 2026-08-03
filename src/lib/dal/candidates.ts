import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
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
  const rows = (await sql`
    INSERT INTO candidates (
      owner_user_id, tenant_id, full_name, normalized_full_name, email, phone, specialty, location,
      extracted_resume_text, ocr_confidence, extraction_quality, recruiter_notes,
      verified_information, created_by
    ) VALUES (
      ${user.id}, ${tenantId}, ${input.full_name ?? null}, ${normalizedName}, ${input.email ?? null},
      ${input.phone ?? null}, ${input.specialty ?? null}, ${input.location ?? null},
      ${input.extracted_resume_text ?? null}, ${input.ocr_confidence ?? null},
      ${input.extraction_quality ?? null}, ${input.recruiter_notes ?? null},
      ${JSON.stringify(input.verified_information ?? {})}, ${user.id}
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
}

/**
 * Candidates for the dashboard list page. When a filter is set, returns
 * job-match rows whose latest analysis matches the dashboard statistic.
 */
export async function listDashboardCandidates(
  user: AppUser,
  opts?: {
    matchCategory?: string;
    submissionReadiness?: string;
  }
): Promise<DashboardCandidateRow[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const matchCategory = opts?.matchCategory ?? null;
  const submissionReadiness = opts?.submissionReadiness ?? null;
  const filtered = Boolean(matchCategory || submissionReadiness);

  if (!filtered) {
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
        c.updated_at
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
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
      jmc.updated_at
    FROM job_match_candidates jmc
    JOIN candidates c ON c.id = jmc.candidate_id
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    WHERE w.tenant_id = ${tenantId}
      AND (${matchCategory}::text IS NULL OR a.match_category = ${matchCategory})
      AND (${submissionReadiness}::text IS NULL OR a.submission_readiness = ${submissionReadiness})
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
  }));
}
