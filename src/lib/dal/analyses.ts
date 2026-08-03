import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import { logCandidateActivity } from "./activity";
import { AuthError, type AppUser } from "@/lib/auth/session";
import type { AiResult } from "@/lib/schema";
import type { AnalyzeRequestBody } from "@/lib/types";
import type { AiProvider } from "@/lib/ai";
import { normalizeCandidateName } from "@/lib/duplicate-candidate/normalize";

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

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
  duplicateWarningAcknowledged?: boolean;
  duplicateConfidence?: "HIGH" | "POSSIBLE" | null;
  candidateName?: string | null;
  matchedAnalysisIds?: string[];
}

export async function saveCandidateAnalysis(
  params: SaveAnalysisParams
): Promise<string> {
  const sql = getSql();
  const { user, validated } = params;
  const tenantId = tenantIdOf(user);
  const cm = validated.candidate_match;
  const provider = params.provider ?? "claude";
  const status = params.analysisStatus ?? "completed";
  const analyzedAt = new Date().toISOString();
  const candidateName =
    params.candidateName ??
    params.input.verified_recruiter_inputs?.candidate_name ??
    null;
  const normalizedCandidateName = candidateName
    ? normalizeCandidateName(candidateName) || null
    : null;

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
      ai_provider, ai_model, analysis_status, analysis_error, analyzed_at,
      candidate_name, normalized_candidate_name,
      duplicate_warning_acknowledged, duplicate_confidence
    ) VALUES (
      ${tenantId}, ${user.id}, ${user.id}, ${user.id},
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
      ${provider}, ${params.model}, ${status}, ${params.analysisError ?? null}, ${analyzedAt},
      ${candidateName}, ${normalizedCandidateName},
      ${params.duplicateWarningAcknowledged ?? false}, ${params.duplicateConfidence ?? null}
    ) RETURNING id
  `) as { id: string }[];

  const analysisId = rows[0].id;

  // Insert requirements (batch when possible).
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
    tenantId,
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

  await logCandidateActivity({
    tenantId,
    candidateId: params.candidateId,
    jobId: params.workspaceId,
    performedByUserId: user.id,
    actionType: "ANALYSIS_COMPLETED",
    newValue: String(cm.recommended_overall_match_score),
    analysisId,
    metadata: {
      analysis_id: analysisId,
      ai_provider: provider,
      ai_model: params.model,
      match_category: cm.match_category,
      match_score: cm.recommended_overall_match_score,
    },
    actorRole: user.role,
    requestId: `analysis-complete:${analysisId}`,
  });

  if (params.duplicateWarningAcknowledged) {
    await audit({
      actorUserId: user.id,
      tenantId,
      entityType: "analysis",
      entityId: analysisId,
      action: "DUPLICATE_WARNING_OVERRIDDEN",
      newValue: {
        candidate_name: candidateName,
        matched_analysis_ids: params.matchedAnalysisIds ?? [],
        duplicate_confidence: params.duplicateConfidence ?? null,
      },
    });
    await logCandidateActivity({
      tenantId,
      candidateId: params.candidateId,
      jobId: params.workspaceId,
      performedByUserId: user.id,
      actionType: "DUPLICATE_WARNING_ACCEPTED",
      metadata: {
        matched_analysis_ids: params.matchedAnalysisIds ?? [],
        duplicate_confidence: params.duplicateConfidence ?? null,
      },
    });
  }

  return analysisId;
}

export interface ReplaceAnalysisResumeParams {
  user: AppUser;
  analysisId: string;
  workspaceId: string;
  candidateId: string;
  jobMatchCandidateId: string;
  existingCandidateName: string | null;
  detectedCandidateName: string | null;
  candidateNameDecision: "KEEP_EXISTING" | "REPLACE_WITH_DETECTED";
  resumeFilename: string;
  resumeFileHash: string | null;
  resumeText: string;
  extractedQuality: string;
  ocrConfidence: number | null;
  extractionMethod: string;
  isImage: boolean;
  fileType: string;
  mimeType: string;
  fileBytes: Buffer;
  validated: AiResult;
  aiRaw: unknown;
  scoreAdjustments: string[];
  model: string;
  provider: AiProvider;
}

export async function replaceAnalysisWithUpdatedResume(
  params: ReplaceAnalysisResumeParams
): Promise<{ resumeVersion: number }> {
  const sql = getSql();
  const tenantId = tenantIdOf(params.user);
  const cm = params.validated.candidate_match;
  const nextCandidateName =
    params.candidateNameDecision === "REPLACE_WITH_DETECTED" &&
    params.detectedCandidateName
      ? params.detectedCandidateName
      : params.existingCandidateName;
  const normalizedNextName = nextCandidateName
    ? normalizeCandidateName(nextCandidateName) || null
    : null;
  const fileB64 = params.fileBytes.toString("base64");
  const requirements = [
    ...params.validated.mandatory_requirements,
    ...params.validated.preferred_requirements,
  ].map((r) => ({
    requirement_text: r.requirement,
    requirement_type: r.requirement_type,
    evidence_status: r.status,
    requirement_outcome: r.requirement_outcome,
    candidate_evidence: r.candidate_evidence,
    evidence_source: r.evidence_source,
    impact: r.impact,
    verification_required: r.verification_required,
    confidence: r.confidence,
  }));

  const txResults = (await sql.transaction((tx) => [
    tx`
      WITH existing AS (
        SELECT *
        FROM candidate_match_analyses
        WHERE id = ${params.analysisId}
          AND tenant_id = ${tenantId}
      ),
      next_version AS (
        SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
        FROM candidate_match_analysis_versions
        WHERE analysis_id = ${params.analysisId}
      ),
      inserted_version AS (
        INSERT INTO candidate_match_analysis_versions (
          analysis_id, version_number, resume_filename, resume_file_url, resume_file_hash, resume_text,
          ai_raw_response_json, validated_result_json, overall_match_score, match_category,
          recommended_action, submission_readiness, confidence_score, model_name, change_reason, created_by
        )
        SELECT
          e.id,
          nv.version_number,
          e.resume_filename,
          COALESCE(e.resume_filename, ''),
          e.resume_file_hash,
          e.resume_text,
          e.ai_raw_response_json,
          e.validated_result_json,
          e.overall_match_score,
          e.match_category,
          e.recommended_action,
          e.submission_readiness,
          e.confidence_score,
          COALESCE(e.ai_model, e.model_name),
          'Resume replaced and analysis rerun',
          ${params.user.id}
        FROM existing e
        CROSS JOIN next_version nv
        RETURNING version_number
      ),
      archive_requirements AS (
        INSERT INTO candidate_match_requirement_versions (
          analysis_id, version_number, requirement_text, requirement_type,
          evidence_status, requirement_outcome, candidate_evidence, evidence_source,
          impact, verification_required, confidence
        )
        SELECT
          r.analysis_id,
          (SELECT version_number FROM inserted_version),
          r.requirement_text,
          r.requirement_type,
          r.evidence_status,
          r.requirement_outcome,
          r.candidate_evidence,
          r.evidence_source,
          r.impact,
          r.verification_required,
          r.confidence
        FROM candidate_match_requirements r
        WHERE r.analysis_id = ${params.analysisId}
      ),
      update_candidate AS (
        UPDATE candidates
        SET
          full_name = ${nextCandidateName},
          normalized_full_name = ${normalizedNextName},
          extracted_resume_text = ${params.resumeText},
          extraction_quality = ${params.extractedQuality},
          ocr_confidence = ${params.ocrConfidence},
          updated_at = now()
        WHERE id = ${params.candidateId}
          AND tenant_id = ${tenantId}
        RETURNING id
      ),
      update_analysis AS (
        UPDATE candidate_match_analyses
        SET
          resume_text = ${params.resumeText},
          ai_raw_response_json = ${JSON.stringify(params.aiRaw)},
          validated_result_json = ${JSON.stringify(params.validated)},
          score_adjustments_json = ${JSON.stringify(params.scoreAdjustments)},
          overall_match_score = ${cm.recommended_overall_match_score},
          match_category = ${cm.match_category},
          recommended_action = ${cm.recommended_action},
          submission_readiness = ${params.validated.submission_readiness.readiness_status},
          confidence_score = ${cm.confidence_score},
          model_name = ${params.model},
          ai_provider = ${params.provider},
          ai_model = ${params.model},
          analysis_status = 'completed',
          analysis_error = NULL,
          analyzed_at = now(),
          candidate_name = ${nextCandidateName},
          normalized_candidate_name = ${normalizedNextName},
          resume_version = COALESCE(resume_version, 1) + 1,
          resume_updated_at = now(),
          resume_updated_by = ${params.user.id},
          resume_filename = ${params.resumeFilename},
          resume_file_hash = ${params.resumeFileHash},
          updated_at = now()
        WHERE id = ${params.analysisId}
          AND tenant_id = ${tenantId}
        RETURNING resume_version
      ),
      replace_requirements AS (
        DELETE FROM candidate_match_requirements
        WHERE analysis_id = ${params.analysisId}
      ),
      insert_requirements AS (
        INSERT INTO candidate_match_requirements (
          analysis_id, requirement_text, requirement_type, evidence_status,
          requirement_outcome, candidate_evidence, evidence_source, impact,
          verification_required, confidence
        )
        SELECT
          ${params.analysisId},
          x.requirement_text,
          x.requirement_type,
          x.evidence_status,
          x.requirement_outcome,
          x.candidate_evidence,
          x.evidence_source,
          x.impact,
          x.verification_required,
          x.confidence
        FROM jsonb_to_recordset(${JSON.stringify(requirements)}::jsonb) AS x(
          requirement_text text,
          requirement_type text,
          evidence_status text,
          requirement_outcome text,
          candidate_evidence text,
          evidence_source text,
          impact text,
          verification_required boolean,
          confidence integer
        )
      ),
      save_file AS (
        INSERT INTO entity_files (
          entity_type, entity_id, owner_user_id, file_name, file_type, mime_type,
          byte_size, is_image, page_order, extracted_text, extraction_method,
          extraction_quality, ocr_confidence, needs_review, created_by, file_bytes, storage_path
        ) VALUES (
          'candidate', ${params.candidateId}, ${params.user.id}, ${params.resumeFilename},
          ${params.fileType}, ${params.mimeType}, ${params.fileBytes.length}, ${params.isImage}, 0,
          ${params.resumeText}, ${params.extractionMethod}, ${params.extractedQuality}, ${params.ocrConfidence},
          false, ${params.user.id}, decode(${fileB64}, 'base64'), 'db://entity_files'
        )
      ),
      update_status AS (
        UPDATE job_match_candidates
        SET status = 'ANALYZED', updated_at = now()
        WHERE id = ${params.jobMatchCandidateId}
          AND workspace_id IN (
            SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId}
          )
      ),
      audit_version AS (
        INSERT INTO audit_logs (
          actor_user_id, tenant_id, entity_type, entity_id, action, new_value_json
        ) VALUES (
          ${params.user.id},
          ${tenantId},
          'analysis',
          ${params.analysisId},
          'RESUME_VERSION_CREATED',
          ${JSON.stringify({
            analysisId: params.analysisId,
            resumeFilename: params.resumeFilename,
            oldScore: null,
            newScore: cm.recommended_overall_match_score,
          })}
        )
      )
      SELECT resume_version FROM update_analysis
    `,
  ])) as Array<Array<{ resume_version: number }>>;

  const resumeVersion = txResults[0]?.[0]?.resume_version;
  if (!resumeVersion) {
    throw new Error("Failed to update analysis with the new resume.");
  }

  await logCandidateActivity({
    tenantId,
    candidateId: params.candidateId,
    jobId: params.workspaceId,
    performedByUserId: params.user.id,
    actionType: "RESUME_REPLACED",
    newValue: params.resumeFilename,
    metadata: {
      analysis_id: params.analysisId,
      resume_version: resumeVersion,
      ai_model: params.model,
      ai_provider: params.provider,
    },
  });
  await logCandidateActivity({
    tenantId,
    candidateId: params.candidateId,
    jobId: params.workspaceId,
    performedByUserId: params.user.id,
    actionType: "ANALYSIS_RERUN",
    newValue: String(cm.recommended_overall_match_score),
    metadata: {
      analysis_id: params.analysisId,
      resume_version: resumeVersion,
      ai_model: params.model,
      ai_provider: params.provider,
    },
  });

  return { resumeVersion };
}

export interface StoredAnalysis {
  id: string;
  workspace_id: string | null;
  candidate_id: string | null;
  job_match_candidate_id: string | null;
  resume_text: string | null;
  job_description_text: string | null;
  structured_job_fields_json: Record<string, unknown> | null;
  recruiter_notes: string | null;
  verified_recruiter_inputs_json: Record<string, unknown> | null;
  ai_raw_response_json: unknown;
  resume_version: number;
  resume_file_hash: string | null;
  resume_filename: string | null;
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
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT id, workspace_id, candidate_id, job_match_candidate_id,
           resume_text, job_description_text, structured_job_fields_json,
           recruiter_notes, verified_recruiter_inputs_json, ai_raw_response_json,
           resume_version, resume_file_hash, resume_filename,
           validated_result_json, score_adjustments_json, created_at, model_name,
           ai_provider, ai_model, analysis_status, analyzed_at
    FROM candidate_match_analyses
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    workspace_id: (row.workspace_id as string) ?? null,
    candidate_id: (row.candidate_id as string) ?? null,
    job_match_candidate_id: (row.job_match_candidate_id as string) ?? null,
    resume_text: (row.resume_text as string) ?? null,
    job_description_text: (row.job_description_text as string) ?? null,
    structured_job_fields_json:
      (row.structured_job_fields_json as Record<string, unknown>) ?? null,
    recruiter_notes: (row.recruiter_notes as string) ?? null,
    verified_recruiter_inputs_json:
      (row.verified_recruiter_inputs_json as Record<string, unknown>) ?? null,
    ai_raw_response_json: row.ai_raw_response_json,
    resume_version: Number(row.resume_version ?? 1),
    resume_file_hash: (row.resume_file_hash as string) ?? null,
    resume_filename: (row.resume_filename as string) ?? null,
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
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT *
    FROM (
      SELECT
        a.id::text AS id,
        a.overall_match_score,
        a.match_category,
        a.submission_readiness,
        a.model_name,
        a.ai_provider,
        a.ai_model,
        a.created_at
      FROM candidate_match_analyses a
      WHERE a.candidate_id = ${candidateId}
        AND a.tenant_id = ${tenantId}

      UNION ALL

      SELECT
        ('version:' || v.id::text) AS id,
        v.overall_match_score,
        v.match_category,
        v.submission_readiness,
        v.model_name,
        NULL::text AS ai_provider,
        v.model_name AS ai_model,
        v.created_at
      FROM candidate_match_analysis_versions v
      JOIN candidate_match_analyses a ON a.id = v.analysis_id
      WHERE a.candidate_id = ${candidateId}
        AND a.tenant_id = ${tenantId}
    ) history
    ORDER BY created_at DESC
  `) as AnalysisHistoryItem[];
  return rows;
}
