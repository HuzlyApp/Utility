import type { NextRequest } from "next/server";
import { performAnalysis } from "@/lib/analyze";
import { saveAnalysis, addAuditLog } from "@/lib/db";
import { AiValidationError } from "@/lib/ai";
import { ok, fail, logServerError } from "@/lib/http";
import { summarizeMandatory } from "@/lib/scoring";
import type { AnalyzeRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Re-runs the analysis after the recruiter has added verified answers or
// corrections. A NEW analysis record is created so history is preserved
// (spec Phase 2 / section 23), linked back to the prior analysis via audit log.
export async function POST(
  req: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  try {
    const body = (await req.json()) as AnalyzeRequestBody;

    if (!body.job_description_text?.trim() || !body.resume_text?.trim()) {
      return fail(
        "Both job description and résumé are required to reanalyze.",
        400,
        "MISSING_INPUT"
      );
    }

    const analysis = await performAnalysis(body);

    let newAnalysisId: string | null = null;
    try {
      newAnalysisId = await saveAnalysis({
        input: body,
        aiRaw: analysis.aiResult,
        validated: analysis.validatedResult,
        scoreAdjustments: analysis.scoreAdjustments,
        model: analysis.model,
      });
      if (newAnalysisId) {
        await addAuditLog(newAnalysisId, {
          action: "REANALYZED_FROM",
          newValue: { previous_analysis_id: params.analysisId },
        });
      }
    } catch (dbErr) {
      logServerError("reanalyze:persist", dbErr);
    }

    return ok({
      analysis_id: newAnalysisId,
      previous_analysis_id: params.analysisId,
      grok_result: analysis.aiResult,
      validated_result: analysis.validatedResult,
      score_adjustments: analysis.scoreAdjustments,
      mandatory_summary: summarizeMandatory(
        analysis.validatedResult.mandatory_requirements
      ),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AiValidationError) {
      logServerError("reanalyze:validation", err.details);
      return fail(
        "The reanalysis could not be completed because the AI response was invalid. Please try again.",
        502,
        "INVALID_AI_RESPONSE"
      );
    }
    logServerError("reanalyze", err);
    return fail("The reanalysis could not be completed.", 500, "ANALYSIS_FAILED");
  }
}
