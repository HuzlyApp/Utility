import type { AiResult, AiRequirement } from "@/lib/schema";
import type { NormalizedJobRequirements } from "@/lib/ai/types";

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
      submission_note: "",
      action_guidance: "",
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

export function makeShortJobDescription(): string {
  return `CT Technologist — Dallas, TX
Must have: ARRT(CT) license, 2+ years hospital CT experience, BLS.
Preferred: EPIC experience, trauma-level experience.
Shift: Nights, 7p-7a, every other weekend.`;
}

export function makeLongJobDescription(): string {
  return `Registered Nurse — ICU — Houston, TX

Overview:
Our client, a 500-bed Level I trauma center in the Texas Medical Center, is seeking experienced ICU RNs for 13-week travel contracts with possible extension.

Mandatory Requirements:
- Must have active Texas RN license or compact license
- Must have BLS, ACLS, and NIHSS certifications
- Must have minimum 3 years of recent ICU experience within the last 24 months
- Must have experience with ventilators, arterial lines, and CRRT
- Must be willing to float to step-down units as needed
- Must have experience with EPIC charting system
- Must be able to start within 4 weeks of offer
- Do not submit candidates with gaps in ICU experience exceeding 6 months
- Only screen candidates who have worked in a Level I or Level II trauma center

Preferred Requirements:
- CCRN certification preferred
- Experience with ECMO preferred
- Previous travel nursing experience preferred
- Experience with Cerner in addition to EPIC preferred
- Bachelor's degree in nursing preferred

Responsibilities:
- Provide direct patient care to critically ill adult patients
- Manage multiple ventilated patients
- Titrate vasoactive medications
- Collaborate with intensivists and ancillary staff
- Document thoroughly in EPIC
- Participate in multidisciplinary rounds

Schedule:
- 36 hours per week, 12-hour shifts
- Night shift 7pm-7am
- Every third weekend required
- Holiday rotation required

Facility Details:
- 500-bed Level I trauma center
- 48-bed ICU
- EPIC electronic medical record
- Teaching hospital with residents and fellows

Compensation:
- Competitive weekly pay
- Housing stipend or provided housing
- Travel reimbursement
- Medical/dental/vision insurance options`;
}

export function makeShortResume(): string {
  return `Jane Doe, ARRT(CT)
5 years CT experience at Methodist Hospital Dallas
EPIC proficient
BLS certified
Available immediately`;
}

export function makeLongResume(): string {
  return `John Smith, RN, BSN, CCRN
123 Main St, Houston, TX | john.smith@email.com | (555) 123-4567

Summary:
Dedicated ICU nurse with 8 years of critical care experience in Level I trauma centers. Proven expertise in managing ventilated patients, CRRT, and ECMO. Strong advocate for patient-centered care and evidence-based practice.

Licenses and Certifications:
- Texas RN License #123456 (expires 2025)
- BLS (American Heart Association, expires 2025)
- ACLS (American Heart Association, expires 2025)
- NIHSS (expires 2025)
- CCRN (AACN, expires 2025)
- TNCC (expires 2024)

Education:
- Bachelor of Science in Nursing, University of Texas at Austin, 2015
- Associate Degree in Nursing, Houston Community College, 2013

Professional Experience:

Senior ICU Staff Nurse
Memorial Hermann-Texas Medical Center, Houston, TX
January 2019 – Present
- Provide direct care to 2-3 critically ill patients per shift in a 48-bed ICU
- Manage ventilators, arterial lines, central lines, and chest tubes
- Administer and titrate vasoactive medications including norepinephrine, vasopressin, and epinephrine
- Operate CRRT for acute kidney injury patients
- Precept new nurses and nursing students
- Charge nurse responsibilities 2-3 shifts per month
- EPIC superuser

ICU Staff Nurse
Ben Taub Hospital, Houston, TX
June 2016 – December 2018
- Cared for critically ill adult patients in a busy county hospital ICU
- Managed trauma patients post-operatively
- Assisted with bedside procedures including intubation and line placement
- Participated in code blue responses
- Used Cerner electronic medical record

Medical-Surgical Nurse
St. Luke's Hospital, Houston, TX
July 2015 – May 2016
- Provided care to general medical-surgical patients
- Managed up to 6 patients per shift
- Gained foundational nursing skills

Skills:
- Ventilator management (Puritan Bennett, Servo-U)
- CRRT (NxStage, Prismaflex)
- ECMO (MAQUET Cardiohelp)
- Arterial blood gas interpretation
- Hemodynamic monitoring (Swan-Ganz, PiCCO)
- EPIC and Cerner EMR proficiency
- Spanish conversational proficiency

Awards:
- Daisy Award for Extraordinary Nurses, 2021
- Employee of the Quarter, Memorial Hermann, Q3 2022

Professional Affiliations:
- American Association of Critical-Care Nurses (AACN)
- Emergency Nurses Association (ENA)`;
}

export function makeNormalizedJobRequirements(
  overrides: Partial<NormalizedJobRequirements> = {}
): NormalizedJobRequirements {
  return {
    contentHash: "test-hash-123",
    generatedAt: new Date().toISOString(),
    version: "1.0",
    mandatoryRequirements: [
      { id: "1", text: "ARRT(CT) license", type: "mandatory", category: "license" },
      { id: "2", text: "2+ years hospital CT", type: "mandatory", category: "experience" },
      { id: "3", text: "BLS", type: "mandatory", category: "certification" },
    ],
    preferredRequirements: [
      { id: "4", text: "EPIC experience", type: "preferred", category: "skill" },
      { id: "5", text: "trauma-level experience", type: "preferred", category: "experience" },
    ],
    requiredLicenses: ["ARRT(CT)"],
    requiredCertifications: ["BLS"],
    requiredExperience: [{ specialty: "CT", years: 2, isMinimum: true }],
    requiredSpecialties: ["CT"],
    locationConstraints: ["Dallas, TX"],
    educationRequirements: [],
    requiredSkills: [],
    requiredWorkSettings: [],
    scheduleRequirements: ["Nights"],
    contextualInfo: { shift: "Night", location: "Dallas, TX" },
    ...overrides,
  };
}
