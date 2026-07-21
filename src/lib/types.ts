// Shared enums, constants, and TypeScript types for the Candidate-to-Job Match Analyzer.
// These mirror the strict controlled vocabularies defined in the product spec.

export const MATCH_CATEGORIES = [
  "STRONG_MATCH",
  "GOOD_MATCH",
  "POSSIBLE_MATCH",
  "WEAK_MATCH",
  "NOT_A_MATCH",
  "NOT_CURRENTLY_SUBMITTABLE",
  "NEEDS_MORE_INFORMATION",
] as const;
export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const RECOMMENDED_ACTIONS = [
  "PRIORITIZE_AND_CALL",
  "CALL_AND_VERIFY",
  "KEEP_AS_POSSIBLE",
  "REDIRECT_TO_OTHER_JOB",
  "STOP_FOR_THIS_JOB",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

// Recruiter-selected final disposition (kept separate from AI recommendation).
export const RECRUITER_DISPOSITIONS = [
  "PROCEED_TO_SCREENING",
  "NEEDS_VERIFICATION",
  "KEEP_AS_POSSIBLE",
  "REDIRECT_CANDIDATE",
  "DO_NOT_PURSUE_THIS_JOB",
] as const;
export type RecruiterDisposition = (typeof RECRUITER_DISPOSITIONS)[number];

export const EVIDENCE_STATUSES = [
  "CONFIRMED",
  "PARTIAL",
  "NOT_FOUND",
  "CONFLICTING",
  "NOT_APPLICABLE",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const REQUIREMENT_OUTCOMES = [
  "MET",
  "VERIFY",
  "NOT_MET",
  "CONFLICT",
  "NOT_APPLICABLE",
] as const;
export type RequirementOutcome = (typeof REQUIREMENT_OUTCOMES)[number];

export const REQUIREMENT_TYPES = ["MANDATORY", "PREFERRED"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const EVIDENCE_SOURCES = [
  "RESUME",
  "VERIFIED_RECRUITER_INPUT",
  "JOB_DESCRIPTION",
  "STRUCTURED_JOB_FIELD",
  "RECRUITER_NOTE",
  "NONE",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export const COMPLETENESS_LEVELS = ["HIGH", "MODERATE", "LOW"] as const;
export type CompletenessLevel = (typeof COMPLETENESS_LEVELS)[number];

export const SUBMISSION_READINESS = [
  "READY_TO_SUBMIT",
  "VERIFY_BEFORE_SUBMISSION",
  "NOT_CURRENTLY_SUBMITTABLE",
  "INSUFFICIENT_INFORMATION",
] as const;
export type SubmissionReadiness = (typeof SUBMISSION_READINESS)[number];

export const EXTRACTION_QUALITY = ["HIGH", "MODERATE", "LOW", "FAILED"] as const;
export type ExtractionQuality = (typeof EXTRACTION_QUALITY)[number];

// Deterministic score map applied in application code (spec section 9).
export const STATUS_SCORE_MAP: Record<EvidenceStatus, number | null> = {
  CONFIRMED: 100,
  PARTIAL: 60,
  NOT_FOUND: 30,
  CONFLICTING: 20,
  NOT_APPLICABLE: null,
};

// Subscore weights (spec section 8). Must sum to 1.0.
export const SUBSCORE_WEIGHTS = {
  mandatory_requirements_score: 0.45,
  specialty_experience_score: 0.2,
  clinical_skills_score: 0.15,
  licenses_certifications_score: 0.1,
  work_setting_equipment_score: 0.05,
  preferred_qualifications_score: 0.05,
} as const;

export type SubscoreKey = keyof typeof SUBSCORE_WEIGHTS;

// Human-readable labels used across the UI.
export const DISPLAY_CATEGORY: Record<MatchCategory, string> = {
  STRONG_MATCH: "Strong Match",
  GOOD_MATCH: "Good Match",
  POSSIBLE_MATCH: "Possible Match",
  WEAK_MATCH: "Weak Match",
  NOT_A_MATCH: "Not a Match",
  NOT_CURRENTLY_SUBMITTABLE: "Not Currently Submittable",
  NEEDS_MORE_INFORMATION: "Needs More Information",
};

export const DISPLAY_ACTION: Record<RecommendedAction, string> = {
  PRIORITIZE_AND_CALL: "Prioritize and Call",
  CALL_AND_VERIFY: "Call and Verify",
  KEEP_AS_POSSIBLE: "Keep as Possible",
  REDIRECT_TO_OTHER_JOB: "Redirect to Other Job",
  // A missing/unverified résumé must not read as "stop"; recommend verification.
  STOP_FOR_THIS_JOB: "Verify Before Decision",
};

export const DISPLAY_DISPOSITION: Record<RecruiterDisposition, string> = {
  PROCEED_TO_SCREENING: "Proceed to Screening",
  NEEDS_VERIFICATION: "Needs Verification",
  KEEP_AS_POSSIBLE: "Keep as Possible",
  REDIRECT_CANDIDATE: "Redirect Candidate",
  DO_NOT_PURSUE_THIS_JOB: "Do Not Pursue for This Job",
};

// Dispositions that require a recruiter note before they can be applied.
export const DISPOSITIONS_REQUIRING_NOTE: RecruiterDisposition[] = [
  "REDIRECT_CANDIDATE",
  "DO_NOT_PURSUE_THIS_JOB",
];

export interface StructuredJobFields {
  job_id?: string;
  job_title?: string;
  msp_name?: string;
  specialty?: string;
  department?: string;
  location?: string;
  minimum_years_experience?: string;
  required_licenses?: string;
  required_certifications?: string;
  required_clinical_skills?: string;
  required_equipment?: string;
  required_charting_system?: string;
  required_patient_population?: string;
  required_work_setting?: string;
  required_trauma_level?: string;
  required_hospital_size?: string;
  required_shift?: string;
  weekend_availability?: string;
  on_call_requirements?: string;
  start_date?: string;
  contract_duration?: string;
  travel_eligibility?: string;
  local_candidate_eligibility?: string;
  education_requirements?: string;
  program_accreditation_requirements?: string;
  additional_submission_restrictions?: string;
}

export interface VerifiedRecruiterInputs {
  candidate_name?: string;
  license_information?: string;
  certification_information?: string;
  equipment_experience?: string;
  shift_availability?: string;
  travel_or_local_preference?: string;
  start_date_availability?: string;
  availability_notes?: string;
}

export interface AnalyzeRequestBody {
  job_id?: string;
  job_title?: string;
  msp_name?: string;
  structured_job_fields?: StructuredJobFields;
  job_description_text: string;
  resume_text: string;
  verified_recruiter_inputs?: VerifiedRecruiterInputs;
  recruiter_notes?: string;
}
