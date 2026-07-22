import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import type { AppUser } from "@/lib/auth/session";
import type { StructuredJobFields } from "@/lib/types";
import type { JobStatus, Workspace, WorkspaceSummary } from "./types";

export interface WorkspaceInput {
  job_ref?: string;
  job_title?: string;
  msp_or_client?: string;
  specialty?: string;
  department?: string;
  location?: string;
  shift?: string;
  start_date?: string;
  job_status?: JobStatus;
  structured_requirements?: StructuredJobFields;
  job_description_text?: string;
  job_description_quality?: string;
}

const n = (v: unknown) => Number(v ?? 0);

export async function createWorkspace(
  user: AppUser,
  input: WorkspaceInput
): Promise<string> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO job_match_workspaces (
      owner_user_id, tenant_id, job_ref, job_title, msp_or_client, specialty,
      department, location, shift, start_date, job_status,
      structured_requirements, job_description_text, job_description_quality
    ) VALUES (
      ${user.id}, ${user.tenantId}, ${input.job_ref ?? null}, ${input.job_title ?? null},
      ${input.msp_or_client ?? null}, ${input.specialty ?? null}, ${input.department ?? null},
      ${input.location ?? null}, ${input.shift ?? null}, ${input.start_date ?? null},
      ${input.job_status ?? "OPEN"},
      ${JSON.stringify(input.structured_requirements ?? {})},
      ${input.job_description_text ?? null}, ${input.job_description_quality ?? null}
    ) RETURNING id
  `) as { id: string }[];
  const id = rows[0].id;
  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "job_workspace",
    entityId: id,
    action: "WORKSPACE_CREATED",
    newValue: { job_title: input.job_title, job_ref: input.job_ref },
  });
  return id;
}

export async function getWorkspace(
  user: AppUser,
  id: string
): Promise<Workspace | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM job_match_workspaces
    WHERE id = ${id} AND owner_user_id = ${user.id}
  `) as Workspace[];
  return rows[0] ?? null;
}

export async function listWorkspaces(
  user: AppUser,
  opts?: { includeArchived?: boolean }
): Promise<WorkspaceSummary[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT w.*,
      COUNT(jmc.id) AS candidate_count,
      COUNT(a.id) AS analyzed_count,
      COUNT(*) FILTER (WHERE a.match_category = 'STRONG_MATCH') AS strong_matches,
      COUNT(*) FILTER (WHERE a.submission_readiness = 'READY_TO_SUBMIT') AS ready_to_submit
    FROM job_match_workspaces w
    LEFT JOIN job_match_candidates jmc ON jmc.workspace_id = w.id
    LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    WHERE w.owner_user_id = ${user.id}
      AND (${opts?.includeArchived ?? false} OR w.workspace_status = 'ACTIVE')
    GROUP BY w.id
    ORDER BY w.updated_at DESC
  `) as Array<Workspace & Record<string, unknown>>;

  return rows.map((r) => ({
    ...(r as Workspace),
    candidate_count: n(r.candidate_count),
    analyzed_count: n(r.analyzed_count),
    strong_matches: n(r.strong_matches),
    ready_to_submit: n(r.ready_to_submit),
  }));
}

export async function updateWorkspace(
  user: AppUser,
  id: string,
  input: WorkspaceInput
): Promise<boolean> {
  const existing = await getWorkspace(user, id);
  if (!existing) return false;
  const sql = getSql();
  await sql`
    UPDATE job_match_workspaces SET
      job_ref = ${input.job_ref ?? existing.job_ref},
      job_title = ${input.job_title ?? existing.job_title},
      msp_or_client = ${input.msp_or_client ?? existing.msp_or_client},
      specialty = ${input.specialty ?? existing.specialty},
      department = ${input.department ?? existing.department},
      location = ${input.location ?? existing.location},
      shift = ${input.shift ?? existing.shift},
      start_date = ${input.start_date ?? existing.start_date},
      job_status = ${input.job_status ?? existing.job_status},
      structured_requirements = ${JSON.stringify(
        input.structured_requirements ?? existing.structured_requirements
      )},
      job_description_text = ${input.job_description_text ?? existing.job_description_text},
      job_description_quality = ${input.job_description_quality ?? existing.job_description_quality},
      updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${user.id}
  `;
  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "job_workspace",
    entityId: id,
    action: "WORKSPACE_UPDATED",
  });
  return true;
}

export async function setWorkspaceStatus(
  user: AppUser,
  id: string,
  status: "ACTIVE" | "ARCHIVED"
): Promise<boolean> {
  const existing = await getWorkspace(user, id);
  if (!existing) return false;
  const sql = getSql();
  await sql`
    UPDATE job_match_workspaces SET workspace_status = ${status}, updated_at = now()
    WHERE id = ${id} AND owner_user_id = ${user.id}
  `;
  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "job_workspace",
    entityId: id,
    action: status === "ARCHIVED" ? "WORKSPACE_ARCHIVED" : "WORKSPACE_RESTORED",
  });
  return true;
}

export interface DeleteWorkspaceResult {
  deleted: boolean;
  candidatesDeleted: number;
  candidatesDetached: number;
}

// Permanently deletes a job workspace and the candidates placed only in that
// job. Candidates that also belong to other jobs are detached (link removed)
// but their records are kept. Related analyses and uploaded files are removed.
export async function deleteWorkspace(
  user: AppUser,
  id: string
): Promise<DeleteWorkspaceResult> {
  const existing = await getWorkspace(user, id);
  if (!existing) {
    return { deleted: false, candidatesDeleted: 0, candidatesDetached: 0 };
  }

  const sql = getSql();

  const linked = (await sql`
    SELECT candidate_id FROM job_match_candidates
    WHERE workspace_id = ${id} AND owner_user_id = ${user.id}
  `) as { candidate_id: string }[];
  const candidateIds = linked.map((r) => r.candidate_id);

  const exclusive = candidateIds.length
    ? ((await sql`
        SELECT jmc.candidate_id
        FROM job_match_candidates jmc
        WHERE jmc.workspace_id = ${id}
          AND jmc.owner_user_id = ${user.id}
          AND NOT EXISTS (
            SELECT 1 FROM job_match_candidates other
            WHERE other.candidate_id = jmc.candidate_id
              AND other.workspace_id <> ${id}
          )
      `) as { candidate_id: string }[])
    : [];
  const exclusiveIds = exclusive.map((r) => r.candidate_id);
  const exclusiveSet = new Set(exclusiveIds);
  const sharedCount = candidateIds.filter((cid) => !exclusiveSet.has(cid)).length;

  // Clear analysis pointers before dropping analyses (no FK, but keeps rows consistent).
  await sql`
    UPDATE job_match_candidates
    SET latest_analysis_id = NULL, updated_at = now()
    WHERE workspace_id = ${id} AND owner_user_id = ${user.id}
  `;

  await sql`
    DELETE FROM candidate_match_analyses
    WHERE workspace_id = ${id} AND owner_user_id = ${user.id}
  `;

  await sql`
    DELETE FROM entity_files
    WHERE owner_user_id = ${user.id}
      AND entity_type = 'job_workspace'
      AND entity_id = ${id}
  `;

  if (exclusiveIds.length > 0) {
    await sql`
      DELETE FROM entity_files
      WHERE owner_user_id = ${user.id}
        AND entity_type = 'candidate'
        AND entity_id IN (
          SELECT jmc.candidate_id
          FROM job_match_candidates jmc
          WHERE jmc.workspace_id = ${id}
            AND jmc.owner_user_id = ${user.id}
            AND NOT EXISTS (
              SELECT 1 FROM job_match_candidates other
              WHERE other.candidate_id = jmc.candidate_id
                AND other.workspace_id <> ${id}
            )
        )
    `;
    await sql`
      DELETE FROM candidates
      WHERE owner_user_id = ${user.id}
        AND id IN (
          SELECT jmc.candidate_id
          FROM job_match_candidates jmc
          WHERE jmc.workspace_id = ${id}
            AND jmc.owner_user_id = ${user.id}
            AND NOT EXISTS (
              SELECT 1 FROM job_match_candidates other
              WHERE other.candidate_id = jmc.candidate_id
                AND other.workspace_id <> ${id}
            )
        )
    `;
  }

  // Remaining shared links + screening/dispositions cascade from workspace delete.
  const removed = (await sql`
    DELETE FROM job_match_workspaces
    WHERE id = ${id} AND owner_user_id = ${user.id}
    RETURNING id
  `) as { id: string }[];

  if (removed.length === 0) {
    return { deleted: false, candidatesDeleted: 0, candidatesDetached: 0 };
  }

  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "job_workspace",
    entityId: id,
    action: "WORKSPACE_DELETED",
    previousValue: {
      job_title: existing.job_title,
      job_ref: existing.job_ref,
      candidates_deleted: exclusiveIds.length,
      candidates_detached: sharedCount,
    },
  });

  return {
    deleted: true,
    candidatesDeleted: exclusiveIds.length,
    candidatesDetached: sharedCount,
  };
}

export interface DashboardStats {
  active_jobs: number;
  total_candidates: number;
  strong_matches: number;
  needs_verification: number;
  ready_to_submit: number;
}

export async function getDashboardStats(user: AppUser): Promise<DashboardStats> {
  const sql = getSql();
  const rows = (await sql`
    WITH latest AS (
      SELECT a.match_category, a.submission_readiness
      FROM job_match_candidates jmc
      JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
      WHERE jmc.owner_user_id = ${user.id}
    )
    SELECT
      (SELECT COUNT(*) FROM job_match_workspaces
        WHERE owner_user_id = ${user.id} AND workspace_status = 'ACTIVE') AS active_jobs,
      (SELECT COUNT(*) FROM candidates WHERE owner_user_id = ${user.id}) AS total_candidates,
      (SELECT COUNT(*) FROM latest WHERE match_category = 'STRONG_MATCH') AS strong_matches,
      (SELECT COUNT(*) FROM latest WHERE submission_readiness = 'VERIFY_BEFORE_SUBMISSION') AS needs_verification,
      (SELECT COUNT(*) FROM latest WHERE submission_readiness = 'READY_TO_SUBMIT') AS ready_to_submit
  `) as Array<Record<string, unknown>>;
  const r = rows[0] ?? {};
  return {
    active_jobs: n(r.active_jobs),
    total_candidates: n(r.total_candidates),
    strong_matches: n(r.strong_matches),
    needs_verification: n(r.needs_verification),
    ready_to_submit: n(r.ready_to_submit),
  };
}

export interface RecentAnalysis {
  analysis_id: string;
  candidate_id: string | null;
  workspace_id: string | null;
  candidate_name: string | null;
  job_title: string | null;
  match_category: string | null;
  overall_match_score: number | null;
  created_at: string;
}

export async function getRecentAnalyses(
  user: AppUser,
  limit = 8
): Promise<RecentAnalysis[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT a.id AS analysis_id, a.candidate_id, a.workspace_id,
           c.full_name AS candidate_name, w.job_title,
           a.match_category, a.overall_match_score, a.created_at
    FROM candidate_match_analyses a
    LEFT JOIN candidates c ON c.id = a.candidate_id
    LEFT JOIN job_match_workspaces w ON w.id = a.workspace_id
    WHERE a.owner_user_id = ${user.id}
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `) as RecentAnalysis[];
  return rows;
}
