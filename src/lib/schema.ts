import { z } from "zod";
import {
  MATCH_CATEGORIES,
  RECOMMENDED_ACTIONS,
  EVIDENCE_STATUSES,
  REQUIREMENT_OUTCOMES,
  REQUIREMENT_TYPES,
  EVIDENCE_SOURCES,
  COMPLETENESS_LEVELS,
  SUBMISSION_READINESS,
} from "./types";

const score0to100 = z.number().min(0).max(100);

export const requirementSchema = z
  .object({
    requirement: z.string().min(1),
    requirement_type: z.enum(REQUIREMENT_TYPES),
    status: z.enum(EVIDENCE_STATUSES),
    requirement_outcome: z.enum(REQUIREMENT_OUTCOMES),
    candidate_evidence: z.string().default(""),
    evidence_source: z.enum(EVIDENCE_SOURCES),
    impact: z.string().default(""),
    verification_required: z.boolean(),
    confidence: score0to100,
  })
  // A qualification marked CONFIRMED must include visible supporting evidence
  // (spec §16/§21). Missing evidence triggers a JSON-repair retry.
  .superRefine((val, ctx) => {
    if (
      val.status === "CONFIRMED" &&
      val.candidate_evidence.trim().length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A CONFIRMED requirement must include candidate_evidence.",
        path: ["candidate_evidence"],
      });
    }
  });
export type AiRequirement = z.infer<typeof requirementSchema>;

export const screeningQuestionSchema = z.object({
  priority: z.number().int().min(1),
  question: z.string().min(1),
  reason: z.string().default(""),
  related_requirement: z.string().default(""),
});
export type AiScreeningQuestion = z.infer<typeof screeningQuestionSchema>;

export const aiResultSchema = z.object({
  analysis_version: z.string().default("1.0"),
  job: z.object({
    job_id: z.string().default(""),
    job_title: z.string().default(""),
    msp_or_client: z.string().default(""),
    specialty: z.string().default(""),
    location: z.string().default(""),
  }),
  candidate_match: z.object({
    // AI's advisory score. The application computes the authoritative
    // final score using deterministic rules (spec §12).
    recommended_overall_match_score: score0to100,
    match_category: z.enum(MATCH_CATEGORIES),
    display_category: z.string().default(""),
    confidence_score: score0to100,
    mandatory_requirement_override: z.boolean().default(false),
    recommended_action: z.enum(RECOMMENDED_ACTIONS),
    recruiter_decision_summary: z.string().default(""),
  }),
  subscores: z.object({
    mandatory_requirements_score: score0to100,
    specialty_experience_score: score0to100,
    clinical_skills_score: score0to100,
    licenses_certifications_score: score0to100,
    work_setting_equipment_score: score0to100,
    preferred_qualifications_score: score0to100,
  }),
  experience_analysis: z.object({
    total_professional_experience_years: z.number().nullable().default(null),
    relevant_specialty_experience_years: z.number().nullable().default(null),
    recent_relevant_experience_years: z.number().nullable().default(null),
    travel_experience_confirmed: z.boolean().default(false),
    required_work_setting_experience_confirmed: z.boolean().default(false),
    is_estimated: z.boolean().default(false),
    experience_calculation_notes: z.array(z.string()).default([]),
  }),
  mandatory_requirements: z.array(requirementSchema).default([]),
  preferred_requirements: z.array(requirementSchema).default([]),
  strengths: z.array(z.string()).default([]),
  gaps_and_risks: z.array(z.string()).default([]),
  screening_questions: z.array(screeningQuestionSchema).max(10).default([]),
  submission_readiness: z.object({
    ready_to_submit: z.boolean().default(false),
    readiness_status: z.enum(SUBMISSION_READINESS),
    items_to_verify_before_submission: z.array(z.string()).default([]),
    documents_or_credentials_needed: z.array(z.string()).default([]),
    blocking_requirements: z.array(z.string()).default([]),
  }),
  alternative_fit: z.object({
    redirect_recommended: z.boolean().default(false),
    redirect_reason: z.string().default(""),
    possible_job_types: z.array(z.string()).default([]),
  }),
  data_quality: z.object({
    resume_completeness: z.enum(COMPLETENESS_LEVELS),
    job_description_completeness: z.enum(COMPLETENESS_LEVELS),
    job_description_conflicts: z.array(z.string()).default([]),
    resume_conflicts: z.array(z.string()).default([]),
    missing_information: z.array(z.string()).default([]),
  }),
});

export type AiResult = z.infer<typeof aiResultSchema>;

// Parse + validate raw model text. Returns a discriminated result so callers can
// decide whether to trigger a JSON-repair retry.
export function parseAiResult(
  raw: string
):
  | { ok: true; data: AiResult }
  | { ok: false; error: string; parsedJson?: unknown } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    return {
      ok: false,
      error: `Response was not valid JSON: ${(err as Error).message}`,
    };
  }
  const result = aiResultSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      parsedJson: json,
    };
  }
  return { ok: true, data: result.data };
}

// Models occasionally wrap JSON in markdown fences despite instructions; strip them defensively.
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}
