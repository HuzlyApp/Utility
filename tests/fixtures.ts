import type { AiResult, AiRequirement } from "@/lib/schema";

export function makeRequirement(
  overrides: Partial<AiRequirement> = {}
): AiRequirement {
  return {
    requirement: "Requirement",
    requirement_type: "MANDATORY",
    status: "CONFIRMED",
    requirement_outcome: "MET",
    candidate_evidence: "Evidence",
    evidence_source: "RESUME",
    impact: "Meets requirement",
    verification_required: false,
    confidence: 90,
    ...overrides,
  };
}

// A baseline schema-valid AiResult. Tests override the parts they exercise.
export function makeAiResult(overrides: Partial<AiResult> = {}): AiResult {
  const base: AiResult = {
    analysis_version: "1.0",
    job: {
      job_id: "1",
      job_title: "CT Technologist",
      msp_or_client: "AMN",
      specialty: "CT",
      location: "TX",
    },
    candidate_match: {
      recommended_overall_match_score: 80,
      match_category: "GOOD_MATCH",
      display_category: "Good Match",
      confidence_score: 85,
      mandatory_requirement_override: false,
      recommended_action: "CALL_AND_VERIFY",
      recruiter_decision_summary: "Summary",
    },
    subscores: {
      mandatory_requirements_score: 80,
      specialty_experience_score: 80,
      clinical_skills_score: 80,
      licenses_certifications_score: 80,
      work_setting_equipment_score: 80,
      preferred_qualifications_score: 80,
    },
    experience_analysis: {
      total_professional_experience_years: 6,
      relevant_specialty_experience_years: 3.8,
      recent_relevant_experience_years: 2.5,
      travel_experience_confirmed: false,
      required_work_setting_experience_confirmed: false,
      is_estimated: false,
      experience_calculation_notes: [],
    },
    mandatory_requirements: [makeRequirement()],
    preferred_requirements: [],
    strengths: [],
    gaps_and_risks: [],
    screening_questions: [],
    submission_readiness: {
      ready_to_submit: false,
      readiness_status: "VERIFY_BEFORE_SUBMISSION",
      items_to_verify_before_submission: [],
      documents_or_credentials_needed: [],
      blocking_requirements: [],
    },
    alternative_fit: {
      redirect_recommended: false,
      redirect_reason: "",
      possible_job_types: [],
    },
    data_quality: {
      resume_completeness: "MODERATE",
      job_description_completeness: "MODERATE",
      job_description_conflicts: [],
      resume_conflicts: [],
      missing_information: [],
    },
  };
  return { ...base, ...overrides };
}
