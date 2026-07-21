import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getWorkspace } from "@/lib/dal/workspaces";
import {
  getCandidate,
  getJobCandidate,
  setJobCandidateStatus,
  setLatestAnalysis,
  updateCandidate,
} from "@/lib/dal/candidates";
import { getEntityImageBytes } from "@/lib/dal/fileStore";
import { saveCandidateAnalysis } from "@/lib/dal/analyses";
import { performAnalysis } from "@/lib/analyze";
import { visionTranscribe } from "@/lib/files";
import type { AnalyzeRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { workspaceId: string; candidateId: string } }
) {
  return withUser("candidates.analyze", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");
    if (!ws.job_description_text) {
      return fail("This workspace has no job description.", 400, "NO_JD");
    }

    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");

    const jmc = await getJobCandidate(user, params.workspaceId, params.candidateId);
    if (!jmc) return fail("Candidate is not attached to this workspace.", 404, "NOT_ATTACHED");

    await setJobCandidateStatus(user, jmc.id, "ANALYZING");

    try {
      let resumeText = (candidate.extracted_resume_text ?? "").trim();

      // Controlled image fallback (spec §9): only when reliable text is missing.
      if (resumeText.length < 40) {
        const images = await getEntityImageBytes(user, "candidate", params.candidateId);
        if (images.length > 0) {
          const vision = await visionTranscribe(images);
          if (vision.ok && vision.text.trim().length > resumeText.length) {
            resumeText = vision.text.trim();
            await updateCandidate(user, params.candidateId, {
              extracted_resume_text: resumeText,
              extraction_quality: "MODERATE",
            });
          }
        }
      }

      if (resumeText.length === 0) {
        await setJobCandidateStatus(user, jmc.id, "NEEDS_REVIEW");
        return fail(
          "No résumé text could be read for this candidate. Review or edit the extracted text first.",
          422,
          "NO_RESUME_TEXT"
        );
      }

      const input: AnalyzeRequestBody = {
        job_id: ws.job_ref ?? undefined,
        job_title: ws.job_title ?? undefined,
        msp_name: ws.msp_or_client ?? undefined,
        structured_job_fields: {
          ...ws.structured_requirements,
          job_id: ws.job_ref ?? undefined,
          job_title: ws.job_title ?? undefined,
          msp_name: ws.msp_or_client ?? undefined,
          specialty: ws.specialty ?? undefined,
          department: ws.department ?? undefined,
          location: ws.location ?? undefined,
        },
        job_description_text: ws.job_description_text,
        resume_text: resumeText,
        verified_recruiter_inputs: {
          ...candidate.verified_information,
          candidate_name: candidate.full_name ?? undefined,
        },
        recruiter_notes: candidate.recruiter_notes ?? undefined,
      };

      const analysis = await performAnalysis(input, {
        tenantId: user.tenantId,
        userId: user.id,
      });

      const analysisId = await saveCandidateAnalysis({
        user,
        workspaceId: params.workspaceId,
        candidateId: params.candidateId,
        jobMatchCandidateId: jmc.id,
        input,
        aiRaw: analysis.aiResult,
        validated: analysis.validatedResult,
        scoreAdjustments: analysis.scoreAdjustments,
        model: analysis.model,
      });

      await setLatestAnalysis(user, jmc.id, analysisId);

      const cm = analysis.validatedResult.candidate_match;
      return ok({
        analysis_id: analysisId,
        candidate_id: params.candidateId,
        overall_match_score: cm.recommended_overall_match_score,
        match_category: cm.match_category,
        submission_readiness: analysis.validatedResult.submission_readiness.readiness_status,
      });
    } catch (err) {
      await setJobCandidateStatus(user, jmc.id, "FAILED");
      throw err;
    }
  });
}
