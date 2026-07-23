import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import type { AppUser } from "@/lib/auth/session";
import type { AiResult } from "@/lib/schema";
import type { AnalyzeRequestBody } from "@/lib/types";
import type { AiProvider } from "@/lib/ai";

export interface SaveAnalysisParams {
  user: AppUser;
  workspaceId: string;
  candidateId: string;
  jobMatchCandidateId: string;
  input: AnalyzeRequestBody;
  aiRaw: unknown;
  validated: AiResult;
  scoreAdjustments: string[];
  model: string;
  provider?: AiProvider;
  analysisStatus?: "completed" | "failed";
  analysisError?: string | null;
}

export async function saveCandidateAnalysis(
  params: SaveAnalysisParams
): Promise<string> {
  const sql = getSql();
  const { user, validated } = params;
  const cm = validated.candidate_match;
  const provider = params.provider ?? "grok";
  const status = params.analysisStatus ?? "completed";
  const analyzedAt = new Date().toISOString();

  const rows = (await sql`
    INSERT INTO candidate_match_analyses (
      tenant_id, owner_user_id, created_by, recruiter_id,
      workspace_id, candidate_id, job_match_candidate_id,
      job_id, job_title, msp_name,
      job_description_text, structured_job_fields_json, resume_text,
      verified_recruiter_inputs_json, recruiter_notes,
      ai_raw_response_json, validated_result_json, score_adjustments_json,
      overall_match_score, match_category, recommended_action,
      submission_readiness, confidence_score, analysis_version, model_name,
      ai_provider, ai_model, analysis_status, analysis_error, analyzed_at
    ) VALUES (
      ${user.tenantId}, ${user.id}, ${user.id}, ${user.id},
      ${params.workspaceId}, ${params.candidateId}, ${params.jobMatchCandidateId},
      ${params.input.job_id ?? null}, ${params.input.job_title ?? null}, ${params.input.msp_name ?? null},
      ${params.input.job_description_text}, ${JSON.stringify(params.input.structured_job_fields ?? {})},
      ${params.input.resume_text}, ${JSON.stringify(params.input.verified_recruiter_inputs ?? {})},
      ${params.input.recruiter_notes ?? null},
      ${JSON.stringify(params.aiRaw)}, ${JSON.stringify(validated)},
      ${JSON.stringify(params.scoreAdjustments)},
      ${cm.recommended_overall_match_score}, ${cm.match_category}, ${cm.recommended_action},
      ${validated.submission_readiness.readiness_status}, ${cm.confidence_score},
      ${validated.analysis_version}, ${params.model},
      ${provider}, ${params.model}, ${status}, ${params.analysisError ?? null}, ${analyzedAt}
    ) RETURNING id
  `) as { id: string }[];

  const analysisId = rows[0].id;

  const allReqs = [
    ...validated.mandatory_requirements,
    ...validated.preferred_requirements,
  ];
  for (const r of allReqs) {
    await sql`
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

  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "analysis",
    entityId: analysisId,
    action: "ANALYSIS_CREATED",
    newValue: {
      candidateId: params.candidateId,
      workspaceId: params.workspaceId,
      match_category: cm.match_category,
      overall_match_score: cm.recommended_overall_match_score,
      ai_provider: provider,
      ai_model: params.model,
    },
  });

  return analysisId;
}

export interface StoredAnalysis {
  id: string;
  workspace_id: string | null;
  candidate_id: string | null;
  validated_result: AiResult;
  score_adjustments: string[];
  created_at: string;
  model_name: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  analysis_status: string | null;
  analyzed_at: string | null;
}

export async function getAnalysis(
  user: AppUser,
  id: string
): Promise<StoredAnalysis | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, workspace_id, candidate_id, validated_result_json,
           score_adjustments_json, created_at, model_name,
           ai_provider, ai_model, analysis_status, analyzed_at
    FROM candidate_match_analyses
    WHERE id = ${id} AND owner_user_id = ${user.id}
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    workspace_id: (row.workspace_id as string) ?? null,
    candidate_id: (row.candidate_id as string) ?? null,
    validated_result: row.validated_result_json as AiResult,
    score_adjustments: (row.score_adjustments_json as string[]) ?? [],
    created_at: String(row.created_at),
    model_name: (row.model_name as string) ?? null,
    ai_provider: (row.ai_provider as string) ?? null,
    ai_model: (row.ai_model as string) ?? (row.model_name as string) ?? null,
    analysis_status: (row.analysis_status as string) ?? "completed",
    analyzed_at: row.analyzed_at
      ? String(row.analyzed_at)
      : String(row.created_at),
  };
}

export interface AnalysisHistoryItem {
  id: string;
  overall_match_score: number | null;
  match_category: string | null;
  submission_readiness: string | null;
  model_name: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  created_at: string;
}

export async function listCandidateAnalyses(
  user: AppUser,
  candidateId: string
): Promise<AnalysisHistoryItem[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, overall_match_score, match_category, submission_readiness,
           model_name, ai_provider, ai_model, created_at
    FROM candidate_match_analyses
    WHERE candidate_id = ${candidateId} AND owner_user_id = ${user.id}
    ORDER BY created_at DESC
  `) as AnalysisHistoryItem[];
  return rows;
}
