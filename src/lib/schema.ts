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
  DISPLAY_CATEGORY,
  type AnalysisMode,
  type EvidenceStatus,
  type RequirementOutcome,
  type RequirementType,
} from "./types";
import { labeledItemFromUnknown } from "./match-display";

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

const stringOrObjectToString = z.union([
  z.string(),
  z.record(z.unknown()).transform((obj) => labeledItemFromUnknown(obj)),
]);

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
    submission_note: z.string().default(""),
    action_guidance: z.string().default(""),
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
  // Coerce object-shaped items some providers emit into plain strings.
  strengths: z.array(stringOrObjectToString).default([]),
  gaps_and_risks: z.array(stringOrObjectToString).default([]),
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

const leanRequirementSchema = z
  .object({
    requirement: z.string().min(1),
    status: z.enum(EVIDENCE_STATUSES),
    evidence: z.string().default(""),
  })
  .superRefine((val, ctx) => {
    if (val.status === "CONFIRMED" && val.evidence.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A CONFIRMED requirement must include evidence.",
        path: ["evidence"],
      });
    }
  });

const leanScreeningQuestionSchema = z.union([
  z.string().min(1),
  z.object({
    question: z.string().min(1),
    priority: z.number().optional(),
    reason: z.string().optional(),
    related_requirement: z.string().optional(),
  }),
]);

export const analyzeLeanResultSchema = z.object({
  recommended_overall_match_score: score0to100,
  match_category: z.enum(MATCH_CATEGORIES),
  recommended_action: z.enum(RECOMMENDED_ACTIONS),
  mandatory_requirements: z.array(leanRequirementSchema).default([]),
  preferred_requirements: z.array(leanRequirementSchema).default([]),
  screening_questions: z.array(leanScreeningQuestionSchema).max(4).default([]),
  items_to_verify: z.array(z.string()).default([]),
  blocking_requirements: z.array(z.string()).default([]),
});

export type AnalyzeLeanResult = z.infer<typeof analyzeLeanResultSchema>;

function outcomeFromStatus(status: EvidenceStatus): RequirementOutcome {
  if (status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (status === "CONFLICTING") return "CONFLICT";
  if (status === "CONFIRMED") return "MET";
  return "VERIFY";
}

function confidenceFromStatus(status: EvidenceStatus): number {
  if (status === "CONFIRMED") return 80;
  if (status === "PARTIAL") return 55;
  if (status === "CONFLICTING") return 40;
  if (status === "NOT_APPLICABLE") return 100;
  return 30;
}

function liftLeanRequirement(
  item: z.infer<typeof leanRequirementSchema>,
  requirementType: RequirementType
) {
  return {
    requirement: item.requirement,
    requirement_type: requirementType,
    status: item.status,
    requirement_outcome: outcomeFromStatus(item.status),
    candidate_evidence: item.evidence,
    evidence_source: item.evidence.trim() ? ("RESUME" as const) : ("NONE" as const),
    impact: "",
    verification_required: item.status !== "CONFIRMED" && item.status !== "NOT_APPLICABLE",
    confidence: confidenceFromStatus(item.status),
  };
}

function isLeanAnalyzeShape(json: unknown): boolean {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const record = json as Record<string, unknown>;
  return (
    "recommended_overall_match_score" in record &&
    !("candidate_match" in record)
  );
}

export function liftLeanResultToAiResult(lean: AnalyzeLeanResult): AiResult {
  const score = lean.recommended_overall_match_score;
  const chronoItems = lean.items_to_verify.filter((item) =>
    /chronolog|anachron|before known product|feature claimed before/i.test(item)
  );
  const applicable = lean.mandatory_requirements.filter(
    (r) => r.status !== "NOT_APPLICABLE"
  );
  const confirmed = applicable.filter((r) => r.status === "CONFIRMED").length;
  const confidence =
    applicable.length === 0
      ? 70
      : Math.round(40 + (60 * confirmed) / applicable.length);

  return aiResultSchema.parse({
    analysis_version: "1.0",
    job: {
      job_id: "",
      job_title: "",
      msp_or_client: "",
      specialty: "",
      location: "",
    },
    candidate_match: {
      recommended_overall_match_score: score,
      match_category: lean.match_category,
      display_category: DISPLAY_CATEGORY[lean.match_category],
      confidence_score: confidence,
      mandatory_requirement_override:
        lean.match_category === "NOT_CURRENTLY_SUBMITTABLE" ||
        lean.blocking_requirements.length > 0,
      recommended_action: lean.recommended_action,
      recruiter_decision_summary: "",
      submission_note: "",
      action_guidance: "",
    },
    subscores: {
      mandatory_requirements_score: score,
      specialty_experience_score: score,
      clinical_skills_score: score,
      licenses_certifications_score: score,
      work_setting_equipment_score: score,
      preferred_qualifications_score: score,
    },
    experience_analysis: {
      total_professional_experience_years: null,
      relevant_specialty_experience_years: null,
      recent_relevant_experience_years: null,
      travel_experience_confirmed: false,
      required_work_setting_experience_confirmed: false,
      is_estimated: false,
      experience_calculation_notes: [],
    },
    mandatory_requirements: lean.mandatory_requirements.map((r) =>
      liftLeanRequirement(r, "MANDATORY")
    ),
    preferred_requirements: lean.preferred_requirements.map((r) =>
      liftLeanRequirement(r, "PREFERRED")
    ),
    strengths: [],
    gaps_and_risks: [],
    screening_questions: lean.screening_questions.map((q, i) =>
      typeof q === "string"
        ? {
            priority: i + 1,
            question: q,
            reason: "",
            related_requirement: "",
          }
        : {
            priority: q.priority ?? i + 1,
            question: q.question,
            reason: q.reason ?? "",
            related_requirement: q.related_requirement ?? "",
          }
    ),
    submission_readiness: {
      ready_to_submit: false,
      readiness_status:
        lean.blocking_requirements.length > 0
          ? "NOT_CURRENTLY_SUBMITTABLE"
          : "VERIFY_BEFORE_SUBMISSION",
      items_to_verify_before_submission: lean.items_to_verify,
      documents_or_credentials_needed: [],
      blocking_requirements: lean.blocking_requirements,
    },
    alternative_fit: {
      redirect_recommended: false,
      redirect_reason: "",
      possible_job_types: [],
    },
    data_quality: {
      resume_completeness: "HIGH",
      job_description_completeness: "HIGH",
      job_description_conflicts: [],
      resume_conflicts: chronoItems,
      missing_information: [],
    },
  });
}

// Parse + validate raw model text. Returns a discriminated result so callers can
// decide whether to trigger a JSON-repair retry.
export function parseAiResult(
  raw: string,
  mode: AnalysisMode = "deep"
):
  | { ok: true; data: AiResult }
  | { ok: false; error: string; parsedJson?: unknown } {
  let json: unknown;
  try {
    json = normalizeParsedJson(JSON.parse(stripCodeFences(raw)), mode);
  } catch (err) {
    return {
      ok: false,
      error: `Response was not valid JSON: ${(err as Error).message}`,
    };
  }

  if (mode === "analyze" && isLeanAnalyzeShape(json)) {
    const lean = analyzeLeanResultSchema.safeParse(json);
    if (!lean.success) {
      return {
        ok: false,
        error: lean.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        parsedJson: json,
      };
    }
    try {
      return { ok: true, data: liftLeanResultToAiResult(lean.data) };
    } catch (err) {
      return {
        ok: false,
        error: `Lean analysis could not be normalized: ${(err as Error).message}`,
        parsedJson: json,
      };
    }
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

function normalizeParsedJson(json: unknown, mode: AnalysisMode = "deep"): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const record = json as Record<string, unknown>;
  const maxQuestions = mode === "analyze" ? 4 : 10;
  if (
    Array.isArray(record.screening_questions) &&
    record.screening_questions.length > maxQuestions
  ) {
    return { ...record, screening_questions: record.screening_questions.slice(0, maxQuestions) };
  }
  return json;
}

// Models occasionally wrap JSON in markdown fences despite instructions; strip them defensively.
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/** Heuristic for JSON cut off by max_tokens output limits. */
export function isLikelyTruncatedJsonError(error: string): boolean {
  return (
    error.includes("not valid JSON") ||
    error.includes("Unterminated string") ||
    error.includes("Unexpected end of JSON") ||
    error.includes("Expected ','") ||
    error.includes("Unexpected token")
  );
}
