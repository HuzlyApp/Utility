import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import type { AppUser } from "@/lib/auth/session";
import { DASHBOARD_DISPOSITIONS, type DashboardDisposition } from "./types";

export function isDashboardDisposition(v: string): v is DashboardDisposition {
  return (DASHBOARD_DISPOSITIONS as readonly string[]).includes(v);
}

// Records a recruiter decision SEPARATELY from the AI recommendation (spec §11).
export async function recordDisposition(params: {
  user: AppUser;
  workspaceId: string;
  candidateId: string;
  analysisId?: string | null;
  disposition: DashboardDisposition;
  notes?: string;
}): Promise<string> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO recruiter_dispositions (
      candidate_id, workspace_id, analysis_id, owner_user_id, disposition, notes, decided_by
    ) VALUES (
      ${params.candidateId}, ${params.workspaceId}, ${params.analysisId ?? null},
      ${params.user.id}, ${params.disposition}, ${params.notes ?? null}, ${params.user.id}
    ) RETURNING id
  `) as { id: string }[];
  await audit({
    actorUserId: params.user.id,
    tenantId: params.user.tenantId,
    entityType: "candidate",
    entityId: params.candidateId,
    action: "DISPOSITION_RECORDED",
    newValue: { disposition: params.disposition, workspaceId: params.workspaceId },
  });
  return rows[0].id;
}

export interface DispositionRow {
  id: string;
  disposition: string;
  notes: string | null;
  created_at: string;
}

export async function getLatestDisposition(
  user: AppUser,
  workspaceId: string,
  candidateId: string
): Promise<DispositionRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, disposition, notes, created_at FROM recruiter_dispositions
    WHERE candidate_id = ${candidateId} AND workspace_id = ${workspaceId}
      AND owner_user_id = ${user.id}
    ORDER BY created_at DESC LIMIT 1
  `) as DispositionRow[];
  return rows[0] ?? null;
}
