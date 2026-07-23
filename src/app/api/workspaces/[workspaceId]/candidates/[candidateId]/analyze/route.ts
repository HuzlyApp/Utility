import { NextResponse } from "next/server";
import { fail, logServerError, logOperational } from "@/lib/http";
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
import {
  resolveAiSelection,
  ProviderUnavailableError,
  ConfigurationError,
  RateLimitError,
  TimeoutError,
  EmptyResponseError,
  AiValidationError,
  AiServiceError,
  AI_MODEL_OPTIONS,
} from "@/lib/ai";
import type { AnalyzeRequestBody } from "@/lib/types";
import {
  analyzingMessage,
  progressForStage,
  type AnalysisProgressEvent,
  type AnalysisProgressStage,
} from "@/lib/analysis-stages";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function modelLabel(optionId: string): string {
  return AI_MODEL_OPTIONS.find((o) => o.id === optionId)?.label ?? "AI";
}

function progressEvent(
  stage: AnalysisProgressStage,
  message: string,
  extra: Partial<AnalysisProgressEvent> = {}
): AnalysisProgressEvent {
  return {
    stage,
    progress: progressForStage(stage),
    message,
    ...extra,
  };
}

function mapAnalyzeError(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (err instanceof ProviderUnavailableError) {
    return { status: 503, code: "PROVIDER_UNAVAILABLE", message: err.message };
  }
  if (err instanceof ConfigurationError) {
    logServerError("workspace.analyze:config", err.message);
    return { status: 503, code: "CONFIGURATION_ERROR", message: err.message };
  }
  if (err instanceof RateLimitError) {
    return { status: 429, code: "RATE_LIMITED", message: err.message };
  }
  if (err instanceof TimeoutError) {
    return { status: 504, code: "TIMEOUT", message: err.message };
  }
  if (err instanceof EmptyResponseError) {
    return { status: 502, code: "EMPTY_RESPONSE", message: err.message };
  }
  if (err instanceof AiValidationError) {
    logServerError("workspace.analyze:validation", err.details);
    return {
      status: 502,
      code: "INVALID_AI_RESPONSE",
      message:
        "The analysis could not be completed because the AI response was invalid. Please try again.",
    };
  }
  if (err instanceof AiServiceError) {
    logServerError("workspace.analyze:service", err.originalError);
    return {
      status: 502,
      code: "AI_SERVICE_ERROR",
      message:
        err.message || "The analysis service encountered an error. Please try again.",
    };
  }
  logServerError("workspace.analyze", err);
  return {
    status: 500,
    code: "SERVER_ERROR",
    message: "Something went wrong. Please try again.",
  };
}

export async function POST(
  req: Request,
  { params }: { params: { workspaceId: string; candidateId: string } }
) {
  return withUser("candidates.analyze", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");
    if (!ws.job_description_text) {
      return fail("This workspace has no job description.", 400, "NO_JD");
    }
    const jobDescriptionText = ws.job_description_text;

    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");

    const jmc = await getJobCandidate(user, params.workspaceId, params.candidateId);
    if (!jmc) return fail("Candidate is not attached to this workspace.", 404, "NOT_ATTACHED");

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return fail("Invalid JSON body.", 400, "INVALID_JSON");
    }

    const selection = resolveAiSelection(body);
    const label = modelLabel(selection.optionId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: AnalysisProgressEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        const failStream = async (message: string, code: string) => {
          try {
            await setJobCandidateStatus(user, jmc.id, "FAILED");
          } catch (statusErr) {
            logServerError("workspace.analyze:status-failed", statusErr);
          }
          send(
            progressEvent("failed", message, {
              candidate_id: params.candidateId,
              error: message,
              code,
              progress: 0,
            })
          );
        };

        try {
          await setJobCandidateStatus(user, jmc.id, "ANALYZING");
          logOperational({
            event: "analysis_started",
            workspaceId: params.workspaceId,
            candidateId: params.candidateId,
            stage: "queued",
            provider: selection.provider,
            model: selection.model,
          });

          send(
            progressEvent("preparing", "Preparing candidate data…", {
              candidate_id: params.candidateId,
            })
          );

          let resumeText = (candidate.extracted_resume_text ?? "").trim();

          // Controlled image fallback (spec §9): only when reliable text is missing.
          if (resumeText.length < 40) {
            send(
              progressEvent("extracting", "Extracting résumé content…", {
                candidate_id: params.candidateId,
              })
            );
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
            send(
              progressEvent(
                "failed",
                "No résumé text could be read for this candidate. Review or edit the extracted text first.",
                {
                  candidate_id: params.candidateId,
                  error:
                    "No résumé text could be read for this candidate. Review or edit the extracted text first.",
                  code: "NO_RESUME_TEXT",
                  progress: 0,
                }
              )
            );
            return;
          }

          send(
            progressEvent("analyzing", analyzingMessage(label), {
              candidate_id: params.candidateId,
              ai_provider: selection.provider,
              ai_model: selection.model,
            })
          );
          logOperational({
            event: "analysis_stage",
            workspaceId: params.workspaceId,
            candidateId: params.candidateId,
            stage: "analyzing",
            provider: selection.provider,
            model: selection.model,
          });

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
            job_description_text: jobDescriptionText,
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
            provider: selection.provider,
            model: selection.model,
            optionId: selection.optionId,
          });

          send(
            progressEvent("validating", "Validating result…", {
              candidate_id: params.candidateId,
            })
          );

          send(
            progressEvent("saving", "Saving analysis…", {
              candidate_id: params.candidateId,
            })
          );

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
            provider: analysis.provider,
            analysisStatus: "completed",
          });

          // Status becomes ANALYZED only after the analysis row exists.
          await setLatestAnalysis(user, jmc.id, analysisId);

          const cm = analysis.validatedResult.candidate_match;
          logOperational({
            event: "analysis_completed",
            workspaceId: params.workspaceId,
            candidateId: params.candidateId,
            analysisId,
            stage: "completed",
            provider: analysis.provider,
            model: analysis.model,
          });

          send(
            progressEvent("completed", "Analysis completed", {
              candidate_id: params.candidateId,
              analysis_id: analysisId,
              overall_match_score: cm.recommended_overall_match_score,
              match_category: cm.match_category,
              submission_readiness:
                analysis.validatedResult.submission_readiness.readiness_status,
              recommended_action: cm.recommended_action,
              ai_provider: analysis.provider,
              ai_model: analysis.model,
            })
          );
        } catch (err) {
          const mapped = mapAnalyzeError(err);
          await failStream(mapped.message, mapped.code);
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Connection: "keep-alive",
      },
    });
  });
}
