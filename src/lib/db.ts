import { neon } from "@neondatabase/serverless";
import { config, persistenceEnabled } from "./config";
import type { AiResult } from "./schema";
import type { AnalyzeRequestBody, RecruiterDisposition } from "./types";

// Lazily-created SQL tagged-template client. Returns null when persistence is
// disabled (no DATABASE_URL), so the app remains fully functional without a DB.
type SqlClient = ReturnType<typeof neon>;
let sql: SqlClient | null = null;
function getSql(): SqlClient | null {
  if (!persistenceEnabled()) return null;
  if (!sql) sql = neon(config.databaseUrl);
  return sql;
}

export interface SavedAnalysis {
  id: string;
  validated_result: AiResult;
  ai_raw_response: unknown;
  score_adjustments: string[];
  recruiter_disposition: RecruiterDisposition | null;
  recruiter_disposition_notes: string | null;
  created_at: string;
  job_title: string | null;
  msp_name: string | null;
}

export async function saveAnalysis(params: {
  input: AnalyzeRequestBody;
  aiRaw: unknown;
  validated: AiResult;
  scoreAdjustments: string[];
  model: string;
  tenantId?: string;
  recruiterId?: string;
}): Promise<string | null> {
  const db = getSql();
  if (!db) return null;

  const cm = params.validated.candidate_match;
  const rows = (await db`
    INSERT INTO candidate_match_analyses (
      tenant_id, job_id, recruiter_id, job_title, msp_name,
      job_description_text, structured_job_fields_json, resume_text,
      verified_recruiter_inputs_json, recruiter_notes,
      ai_raw_response_json, validated_result_json,
      overall_match_score, match_category, recommended_action,
      submission_readiness, confidence_score, analysis_version, model_name
    ) VALUES (
      ${params.tenantId ?? "default"}, ${params.input.job_id ?? null},
      ${params.recruiterId ?? null}, ${params.input.job_title ?? null},
      ${params.input.msp_name ?? null}, ${params.input.job_description_text},
      ${JSON.stringify(params.input.structured_job_fields ?? {})},
      ${params.input.resume_text},
      ${JSON.stringify(params.input.verified_recruiter_inputs ?? {})},
      ${params.input.recruiter_notes ?? null},
      ${JSON.stringify(params.aiRaw)}, ${JSON.stringify(params.validated)},
      ${cm.recommended_overall_match_score}, ${cm.match_category},
      ${cm.recommended_action},
      ${params.validated.submission_readiness.readiness_status},
      ${cm.confidence_score}, ${params.validated.analysis_version},
      ${params.model}
    )
    RETURNING id
  `) as { id: string }[];

  const analysisId = rows[0]?.id;
  if (!analysisId) return null;

  const allReqs = [
    ...params.validated.mandatory_requirements,
    ...params.validated.preferred_requirements,
  ];
  for (const r of allReqs) {
    await db`
      INSERT INTO candidate_match_requirements (
        analysis_id, requirement_text, requirement_type, evidence_status,
        requirement_outcome, candidate_evidence, evidence_source, impact,
        verification_required, confidence
      ) VALUES (
        ${analysisId}, ${r.requirement}, ${r.requirement_type}, ${r.status},
        ${r.requirement_outcome}, ${r.candidate_evidence}, ${r.evidence_source},
        ${r.impact}, ${r.verification_required}, ${r.confidence}
      )
    `;
  }

  await addAuditLog(analysisId, {
    action: "ANALYSIS_CREATED",
    newValue: {
      match_category: cm.match_category,
      overall_match_score: cm.recommended_overall_match_score,
      score_adjustments: params.scoreAdjustments,
    },
  });

  return analysisId;
}

export async function getAnalysis(
  id: string
): Promise<SavedAnalysis | null> {
  const db = getSql();
  if (!db) return null;
  const rows = (await db`
    SELECT id, validated_result_json, ai_raw_response_json,
           recruiter_disposition, recruiter_disposition_notes,
           created_at, job_title, msp_name
    FROM candidate_match_analyses WHERE id = ${id}
  `) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    validated_result: row.validated_result_json as AiResult,
    ai_raw_response: row.ai_raw_response_json,
    score_adjustments: [],
    recruiter_disposition: row.recruiter_disposition as RecruiterDisposition | null,
    recruiter_disposition_notes: row.recruiter_disposition_notes as string | null,
    created_at: String(row.created_at),
    job_title: row.job_title as string | null,
    msp_name: row.msp_name as string | null,
  };
}

export async function updateDisposition(params: {
  analysisId: string;
  disposition: RecruiterDisposition;
  notes?: string;
  actorUserId?: string;
}): Promise<boolean> {
  const db = getSql();
  if (!db) return false;

  const prev = (await db`
    SELECT recruiter_disposition, recruiter_disposition_notes
    FROM candidate_match_analyses WHERE id = ${params.analysisId}
  `) as Record<string, unknown>[];
  if (prev.length === 0) return false;

  await db`
    UPDATE candidate_match_analyses
    SET recruiter_disposition = ${params.disposition},
        recruiter_disposition_notes = ${params.notes ?? null},
        updated_at = now()
    WHERE id = ${params.analysisId}
  `;

  await addAuditLog(params.analysisId, {
    action: "DISPOSITION_SET",
    actorUserId: params.actorUserId,
    previousValue: prev[0],
    newValue: { disposition: params.disposition, notes: params.notes ?? null },
  });
  return true;
}

export async function verifyRequirement(params: {
  requirementId: string;
  verified: boolean;
  note?: string;
  actorUserId?: string;
}): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  const rows = (await db`
    UPDATE candidate_match_requirements
    SET recruiter_verified = ${params.verified},
        recruiter_verification_note = ${params.note ?? null},
        updated_at = now()
    WHERE id = ${params.requirementId}
    RETURNING analysis_id
  `) as { analysis_id: string }[];
  if (rows.length === 0) return false;
  await addAuditLog(rows[0].analysis_id, {
    action: "REQUIREMENT_VERIFIED",
    actorUserId: params.actorUserId,
    newValue: { requirementId: params.requirementId, verified: params.verified },
  });
  return true;
}

export async function addAuditLog(
  analysisId: string,
  entry: {
    action: string;
    actorUserId?: string;
    previousValue?: unknown;
    newValue?: unknown;
  }
): Promise<void> {
  const db = getSql();
  if (!db) return;
  await db`
    INSERT INTO candidate_match_audit_logs (
      analysis_id, actor_user_id, action, previous_value_json, new_value_json
    ) VALUES (
      ${analysisId}, ${entry.actorUserId ?? null}, ${entry.action},
      ${entry.previousValue ? JSON.stringify(entry.previousValue) : null},
      ${entry.newValue ? JSON.stringify(entry.newValue) : null}
    )
  `;
}
