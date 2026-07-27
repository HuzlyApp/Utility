/**
 * In-Flight Analysis Tracking
 * 
 * Prevents duplicate Claude requests from double-clicks, retries, or race conditions.
 * Uses database-backed locking with expiration for serverless safety.
 */

import { getSql } from "@/lib/dal/client";
import { logAnalysisOperation } from "@/lib/ai/log";

export type AnalysisStatus = 
  | "PENDING"
  | "ANALYZING" 
  | "VALIDATING"
  | "SCORING"
  | "SAVING"
  | "COMPLETE"
  | "FAILED";

export interface InFlightAnalysis {
  id: string;
  idempotencyKey: string;
  workspaceId?: string;
  candidateId?: string;
  status: AnalysisStatus;
  analysisId?: string | null;
  startedAt: Date;
  expiresAt: Date;
  tenantId: string;
  userId?: string;
}

/** Check if an analysis is already in progress for the given idempotency key */
export async function getInFlightAnalysis(
  idempotencyKey: string,
  tenantId: string = "default"
): Promise<InFlightAnalysis | null> {
  const sql = getSql();
  if (!sql) return null;

  // Clean up expired entries first (fire and forget)
  cleanupExpiredAnalyses().catch(() => {
    /* ignore */
  });

  const rows = (await sql`
    SELECT 
      id,
      idempotency_key,
      workspace_id,
      candidate_id,
      status,
      analysis_id,
      started_at,
      expires_at,
      tenant_id,
      user_id
    FROM analysis_in_flight
    WHERE idempotency_key = ${idempotencyKey}
      AND tenant_id = ${tenantId}
      AND expires_at > NOW()
  `) as Array<Record<string, unknown>>;

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    workspaceId: (row.workspace_id as string) ?? undefined,
    candidateId: (row.candidate_id as string) ?? undefined,
    status: row.status as AnalysisStatus,
    analysisId: (row.analysis_id as string) ?? null,
    startedAt: new Date(row.started_at as string),
    expiresAt: new Date(row.expires_at as string),
    tenantId: row.tenant_id as string,
    userId: (row.user_id as string) ?? undefined,
  };
}

/** Start tracking a new in-flight analysis */
export async function startInFlightAnalysis(
  idempotencyKey: string,
  params: {
    workspaceId?: string;
    candidateId?: string;
    tenantId?: string;
    userId?: string;
  }
): Promise<InFlightAnalysis | null> {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = (await sql`
      INSERT INTO analysis_in_flight (
        idempotency_key,
        workspace_id,
        candidate_id,
        status,
        tenant_id,
        user_id,
        started_at,
        expires_at
      ) VALUES (
        ${idempotencyKey},
        ${params.workspaceId ?? null},
        ${params.candidateId ?? null},
        'ANALYZING',
        ${params.tenantId ?? "default"},
        ${params.userId ?? null},
        NOW(),
        NOW() + INTERVAL '5 minutes'
      )
      ON CONFLICT (idempotency_key) DO UPDATE SET
        status = 'ANALYZING',
        expires_at = NOW() + INTERVAL '5 minutes'
      WHERE analysis_in_flight.expires_at < NOW()
        OR analysis_in_flight.status IN ('COMPLETE', 'FAILED')
      RETURNING 
        id,
        idempotency_key,
        workspace_id,
        candidate_id,
        status,
        analysis_id,
        started_at,
        expires_at,
        tenant_id,
        user_id
    `) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      // Another process is already handling this request
      return getInFlightAnalysis(idempotencyKey, params.tenantId);
    }

    const row = rows[0];
    return {
      id: row.id as string,
      idempotencyKey: row.idempotency_key as string,
      workspaceId: (row.workspace_id as string) ?? undefined,
      candidateId: (row.candidate_id as string) ?? undefined,
      status: row.status as AnalysisStatus,
      analysisId: (row.analysis_id as string) ?? null,
      startedAt: new Date(row.started_at as string),
      expiresAt: new Date(row.expires_at as string),
      tenantId: row.tenant_id as string,
      userId: (row.user_id as string) ?? undefined,
    };
  } catch (error) {
    logAnalysisOperation("in_flight_start_failed", {
      analysisId: undefined,
      tenantId: params.tenantId ?? "default",
      userId: params.userId,
      inputCharCount: 0,
      resumeCharCount: 0,
      jobCharCount: 0,
      provider: "claude",
      model: "unknown",
    }, {
      idempotencyKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/** Update the status of an in-flight analysis */
export async function updateInFlightStatus(
  idempotencyKey: string,
  status: AnalysisStatus,
  analysisId?: string
): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;

  const result = (await sql`
    UPDATE analysis_in_flight
    SET 
      status = ${status},
      ${analysisId ? sql`analysis_id = ${analysisId},` : sql``}
      expires_at = CASE 
        WHEN ${status} IN ('COMPLETE', 'FAILED') THEN NOW() + INTERVAL '1 hour'
        ELSE NOW() + INTERVAL '5 minutes'
      END
    WHERE idempotency_key = ${idempotencyKey}
  `) as { count: number }[];

  return (result[0]?.count ?? 0) > 0;
}

/** Complete an in-flight analysis and optionally cache the result reference */
export async function completeInFlightAnalysis(
  idempotencyKey: string,
  analysisId: string,
  success: boolean
): Promise<void> {
  const sql = getSql();
  if (!sql) return;

  await sql`
    UPDATE analysis_in_flight
    SET 
      status = ${success ? "COMPLETE" : "FAILED"},
      analysis_id = ${analysisId},
      expires_at = NOW() + INTERVAL '1 hour'
    WHERE idempotency_key = ${idempotencyKey}
  `;
}

/** Release the lock for an in-flight analysis (cleanup) */
export async function releaseInFlightAnalysis(idempotencyKey: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;

  // For completed/failed analyses, keep the record briefly for idempotency
  // For active analyses, mark as failed to allow retry
  await sql`
    UPDATE analysis_in_flight
    SET 
      status = CASE 
        WHEN status IN ('COMPLETE', 'FAILED') THEN status
        ELSE 'FAILED'
      END,
      expires_at = CASE 
        WHEN status IN ('COMPLETE', 'FAILED') THEN expires_at
        ELSE NOW() + INTERVAL '1 minute'
      END
    WHERE idempotency_key = ${idempotencyKey}
  `;
}

/** Get a completed analysis result by idempotency key (for replay) */
export async function getCompletedAnalysisId(
  idempotencyKey: string,
  tenantId: string = "default"
): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;

  const rows = (await sql`
    SELECT analysis_id
    FROM analysis_in_flight
    WHERE idempotency_key = ${idempotencyKey}
      AND tenant_id = ${tenantId}
      AND status = 'COMPLETE'
      AND analysis_id IS NOT NULL
      AND expires_at > NOW()
  `) as { analysis_id: string }[];

  return rows[0]?.analysis_id ?? null;
}

/** Clean up expired in-flight analysis records */
export async function cleanupExpiredAnalyses(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;

  const result = (await sql`
    DELETE FROM analysis_in_flight
    WHERE expires_at < NOW()
  `) as { count: number }[];

  return result[0]?.count ?? 0;
}

/** Generate a deterministic idempotency key from request parameters */
export function generateIdempotencyKey(
  workspaceId: string,
  candidateId: string,
  jobContentHash: string,
  resumeText: string
): string {
  const crypto = require("crypto");
  const keyData = `${workspaceId}:${candidateId}:${jobContentHash}:${resumeText.substring(0, 200)}`;
  return crypto.createHash("sha256").update(keyData).digest("hex").substring(0, 32);
}
