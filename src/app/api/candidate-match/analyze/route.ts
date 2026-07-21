import type { NextRequest } from "next/server";
import { performAnalysis } from "@/lib/analyze";
import { saveAnalysis } from "@/lib/db";
import {
  AiValidationError,
  ConfigurationError,
  RateLimitError,
  TimeoutError,
  EmptyResponseError,
  AiServiceError,
} from "@/lib/ai";
import { ok, fail, logServerError, logOperational } from "@/lib/http";
import { summarizeMandatory } from "@/lib/scoring";
import type { AnalyzeRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Simple in-process lock to prevent duplicate analyses from double-clicks
// (spec section 26). Keyed by a client-supplied idempotency key.
const inFlight = new Set<string>();

export async function POST(req: NextRequest) {
  let idempotencyKey: string | null = null;
  try {
    const body = (await req.json()) as AnalyzeRequestBody & {
      idempotency_key?: string;
    };

    if (!body.job_description_text || body.job_description_text.trim().length === 0) {
      return fail("Job-description text is required.", 400, "MISSING_JOB");
    }
    if (!body.resume_text || body.resume_text.trim().length === 0) {
      return fail("Candidate résumé text is required.", 400, "MISSING_RESUME");
    }

    idempotencyKey = body.idempotency_key ?? null;
    if (idempotencyKey) {
      if (inFlight.has(idempotencyKey)) {
        return fail(
          "An analysis for this request is already in progress.",
          409,
          "DUPLICATE_REQUEST"
        );
      }
      inFlight.add(idempotencyKey);
    }

    const input: AnalyzeRequestBody = {
      job_id: body.job_id,
      job_title: body.job_title,
      msp_name: body.msp_name,
      structured_job_fields: body.structured_job_fields,
      job_description_text: body.job_description_text,
      resume_text: body.resume_text,
      verified_recruiter_inputs: body.verified_recruiter_inputs,
      recruiter_notes: body.recruiter_notes,
    };

    const startedAt = Date.now();
    const analysis = await performAnalysis(input);

    let analysisId: string | null = null;
    try {
      analysisId = await saveAnalysis({
        input,
        aiRaw: analysis.aiResult,
        validated: analysis.validatedResult,
        scoreAdjustments: analysis.scoreAdjustments,
        model: analysis.model,
      });
    } catch (dbErr) {
      // Persistence is best-effort; never block the recruiter on a DB error.
      logServerError("analyze:persist", dbErr);
    }

    // Operational metadata only — no résumé/job content or secrets (spec §28).
    logOperational({
      event: "analyze",
      analysis_id: analysisId,
      model: analysis.model,
      duration_ms: Date.now() - startedAt,
      job_chars: input.job_description_text.length,
      resume_chars: input.resume_text.length,
      repaired: analysis.repaired,
      match_category: analysis.validatedResult.candidate_match.match_category,
      validation_status: "valid",
    });

    return ok({
      analysis_id: analysisId,
      ai_result: analysis.aiResult,
      validated_result: analysis.validatedResult,
      score_adjustments: analysis.scoreAdjustments,
      mandatory_summary: summarizeMandatory(
        analysis.validatedResult.mandatory_requirements
      ),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Handle specific error types with appropriate user-facing messages
    if (err instanceof ConfigurationError) {
      logServerError("analyze:config", err.message);
      return fail(
        "The analysis service is not properly configured. Please contact support.",
        500,
        "CONFIGURATION_ERROR"
      );
    }
    
    if (err instanceof RateLimitError) {
      logServerError("analyze:rate_limit", err.message);
      return fail(
        "The analysis service is currently busy. Please try again in a moment.",
        429,
        "RATE_LIMITED"
      );
    }
    
    if (err instanceof TimeoutError) {
      logServerError("analyze:timeout", err.message);
      return fail(
        "The analysis took too long to complete. Please try with shorter documents or try again later.",
        504,
        "TIMEOUT"
      );
    }
    
    if (err instanceof EmptyResponseError) {
      logServerError("analyze:empty_response", err.message);
      return fail(
        "The AI service returned an empty response. Please try again.",
        502,
        "EMPTY_RESPONSE"
      );
    }
    
    if (err instanceof AiValidationError) {
      logServerError("analyze:validation", err.details);
      return fail(
        "The analysis could not be completed because the AI response was invalid. Please try again.",
        502,
        "INVALID_AI_RESPONSE"
      );
    }
    
    if (err instanceof AiServiceError) {
      logServerError("analyze:service_error", err.originalError);
      return fail(
        "The analysis service encountered an error. Please try again.",
        502,
        "AI_SERVICE_ERROR"
      );
    }
    
    logServerError("analyze", err);
    return fail(
      "The analysis could not be completed. Please try again.",
      500,
      "ANALYSIS_FAILED"
    );
  } finally {
    if (idempotencyKey) inFlight.delete(idempotencyKey);
  }
}
