import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { fail, ok, logServerError } from "@/lib/http";
import { getAnalysis, replaceAnalysisWithUpdatedResume } from "@/lib/dal/analyses";
import { getWorkspace } from "@/lib/dal/workspaces";
import { getCandidate, getJobCandidate, setJobCandidateStatus } from "@/lib/dal/candidates";
import { extractFromUpload, validateUpload } from "@/lib/files";
import { detectCandidateNameFromResumeText, namesMatch } from "@/lib/resume-name";
import { performAnalysis } from "@/lib/analyze";
import { resolveAiSelection } from "@/lib/ai";
import { hashUploadBuffers } from "@/lib/duplicate-candidate/find-duplicates";
import { audit } from "@/lib/dal/audit";
import type { AnalyzeRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LOCKED_STATUSES = new Set([
  "ANALYZING",
  "UPDATE_PENDING",
  "EXTRACTING_UPDATED_RESUME",
  "REANALYZING",
  "VALIDATING",
  "SAVING",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  return withUser("candidate-match.update-resume", async (user) => {
    const analysis = await getAnalysis(user, params.analysisId);
    if (!analysis || !analysis.workspace_id || !analysis.candidate_id || !analysis.job_match_candidate_id) {
      return fail("Analysis not found.", 404, "NOT_FOUND");
    }

    const workspace = await getWorkspace(user, analysis.workspace_id);
    if (!workspace || !workspace.job_description_text) {
      return fail("Workspace not found or missing job description.", 404, "NOT_FOUND");
    }

    const candidate = await getCandidate(user, analysis.candidate_id);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");

    const jmc = await getJobCandidate(user, analysis.workspace_id, analysis.candidate_id);
    if (!jmc) return fail("Candidate is not attached to this workspace.", 404, "NOT_ATTACHED");
    if (LOCKED_STATUSES.has(jmc.status)) {
      return fail("A resume update or analysis is already in progress.", 409, "ALREADY_UPDATING");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("Please choose a resume file.", 400, "NO_FILE");
    }
    const continueMismatch = String(form.get("continue_name_mismatch") ?? "") === "true";
    const candidateNameDecisionRaw = String(form.get("candidate_name_decision") ?? "");
    const candidateNameDecision =
      candidateNameDecisionRaw === "replace"
        ? "REPLACE_WITH_DETECTED"
        : "KEEP_EXISTING";

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUpload(buffer, file.name, file.type);
    if (!validation.ok) {
      return fail(validation.error ?? "Invalid file.", 400, "INVALID_FILE");
    }

    try {
      await setJobCandidateStatus(user, jmc.id, "UPDATE_PENDING");
      await audit({
        actorUserId: user.id,
        tenantId: user.tenantId,
        entityType: "analysis",
        entityId: analysis.id,
        action: "RESUME_UPDATE_STARTED",
        newValue: {
          analysisId: analysis.id,
          candidateId: candidate.id,
          workspaceId: workspace.id,
        },
      });

      await setJobCandidateStatus(user, jmc.id, "EXTRACTING_UPDATED_RESUME");
      const extraction = await extractFromUpload(buffer, file.name, validation.isImage);
      const resumeText = extraction.text.trim();
      if (!resumeText) {
        await setJobCandidateStatus(user, jmc.id, "UPDATE_FAILED");
        await audit({
          actorUserId: user.id,
          tenantId: user.tenantId,
          entityType: "analysis",
          entityId: analysis.id,
          action: "RESUME_UPDATE_FAILED",
          newValue: { reason: "EXTRACTION_EMPTY" },
        });
        return fail("No resume text could be extracted from the uploaded file.", 422, "EXTRACTION_FAILED");
      }

      const detectedName = detectCandidateNameFromResumeText(resumeText);
      const existingName = candidate.full_name;
      const mismatch = Boolean(detectedName && existingName && !namesMatch(existingName, detectedName));
      if (mismatch && !continueMismatch) {
        await setJobCandidateStatus(user, jmc.id, "ANALYZED");
        return NextResponse.json(
          {
            success: false,
            code: "RESUME_NAME_MISMATCH",
            error: `The uploaded resume appears to belong to "${detectedName}", but this record is for "${existingName}".`,
            detected_name: detectedName,
            existing_name: existingName,
          },
          { status: 409 }
        );
      }
      if (mismatch) {
        await audit({
          actorUserId: user.id,
          tenantId: user.tenantId,
          entityType: "analysis",
          entityId: analysis.id,
          action: "RESUME_NAME_MISMATCH_OVERRIDDEN",
          newValue: {
            existingCandidateName: existingName,
            detectedName,
            decision: candidateNameDecision,
          },
        });
      }

      await setJobCandidateStatus(user, jmc.id, "REANALYZING");
      const selection = resolveAiSelection({
        ai_model_option: form.get("ai_model_option"),
      });
      const input: AnalyzeRequestBody = {
        job_id: workspace.job_ref ?? undefined,
        job_title: workspace.job_title ?? undefined,
        msp_name: workspace.msp_or_client ?? undefined,
        structured_job_fields: {
          ...workspace.structured_requirements,
          job_id: workspace.job_ref ?? undefined,
          job_title: workspace.job_title ?? undefined,
          msp_name: workspace.msp_or_client ?? undefined,
          specialty: workspace.specialty ?? undefined,
          department: workspace.department ?? undefined,
          location: workspace.location ?? undefined,
        },
        job_description_text: workspace.job_description_text,
        resume_text: resumeText,
        verified_recruiter_inputs: {
          ...(candidate.verified_information ?? {}),
          candidate_name: candidate.full_name ?? undefined,
        },
        recruiter_notes: candidate.recruiter_notes ?? undefined,
      };

      const startedAt = Date.now();
      const analysisResult = await performAnalysis(input, {
        tenantId: user.tenantId,
        userId: user.id,
        provider: selection.provider,
        model: selection.model,
        optionId: selection.optionId,
      });

      await setJobCandidateStatus(user, jmc.id, "VALIDATING");
      await setJobCandidateStatus(user, jmc.id, "SAVING");
      const update = await replaceAnalysisWithUpdatedResume({
        user,
        analysisId: analysis.id,
        workspaceId: workspace.id,
        candidateId: candidate.id,
        jobMatchCandidateId: jmc.id,
        existingCandidateName: candidate.full_name,
        detectedCandidateName: detectedName,
        candidateNameDecision,
        resumeFilename: file.name,
        resumeFileHash: hashUploadBuffers([buffer]),
        resumeText,
        extractedQuality: extraction.quality,
        ocrConfidence: extraction.ocrConfidence,
        extractionMethod: extraction.method,
        isImage: validation.isImage,
        fileType: validation.ext,
        mimeType: validation.mimeType,
        fileBytes: buffer,
        validated: analysisResult.validatedResult,
        aiRaw: analysisResult.aiResult,
        scoreAdjustments: analysisResult.scoreAdjustments,
        model: analysisResult.model,
        provider: analysisResult.provider,
      });

      await audit({
        actorUserId: user.id,
        tenantId: user.tenantId,
        entityType: "analysis",
        entityId: analysis.id,
        action: "ANALYSIS_RERUN_COMPLETED",
        newValue: {
          analysisId: analysis.id,
          previousResumeVersion: analysis.resume_version,
          newResumeVersion: update.resumeVersion,
          previousScore: analysis.validated_result.candidate_match.recommended_overall_match_score,
          newScore: analysisResult.validatedResult.candidate_match.recommended_overall_match_score,
          model: analysisResult.model,
          durationMs: Date.now() - startedAt,
        },
      });

      return ok({
        analysis_id: analysis.id,
        candidate_id: candidate.id,
        workspace_id: workspace.id,
        resume_version: update.resumeVersion,
        detected_candidate_name: detectedName,
        overall_match_score:
          analysisResult.validatedResult.candidate_match.recommended_overall_match_score,
        match_category: analysisResult.validatedResult.candidate_match.match_category,
        submission_readiness:
          analysisResult.validatedResult.submission_readiness.readiness_status,
        recommended_action:
          analysisResult.validatedResult.candidate_match.recommended_action,
        ai_provider: analysisResult.provider,
        ai_model: analysisResult.model,
      });
    } catch (err) {
      await setJobCandidateStatus(user, jmc.id, "UPDATE_FAILED");
      await audit({
        actorUserId: user.id,
        tenantId: user.tenantId,
        entityType: "analysis",
        entityId: analysis.id,
        action: "RESUME_UPDATE_FAILED",
        newValue: {
          reason: err instanceof Error ? err.message : "UNKNOWN",
        },
      });
      logServerError("candidate-match.update-resume", err);
      return fail("Resume update failed. The current analysis remains unchanged.", 500, "UPDATE_FAILED");
    }
  });
}
