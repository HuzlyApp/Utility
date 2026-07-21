import type { StructuredJobFields, VerifiedRecruiterInputs } from "@/lib/types";

export type WorkspaceStatus = "ACTIVE" | "ARCHIVED";
export type JobStatus = "OPEN" | "ON_HOLD" | "FILLED" | "CLOSED";

// Per-job candidate pipeline status (spec §7).
export type CandidatePipelineStatus =
  | "QUEUED"
  | "UPLOADING"
  | "EXTRACTING"
  | "OCR_PROCESSING"
  | "READY"
  | "NEEDS_REVIEW"
  | "DUPLICATE"
  | "FAILED"
  | "ANALYZING"
  | "ANALYZED";

// Recruiter dispositions per spec §11 (kept separate from the AI recommendation).
export const DASHBOARD_DISPOSITIONS = [
  "PROCEED_TO_SCREENING",
  "NEEDS_VERIFICATION",
  "KEEP_AS_POSSIBLE",
  "REDIRECT_CANDIDATE",
  "DO_NOT_PURSUE_FOR_THIS_JOB",
] as const;
export type DashboardDisposition = (typeof DASHBOARD_DISPOSITIONS)[number];

export const DISPOSITION_LABELS: Record<DashboardDisposition, string> = {
  PROCEED_TO_SCREENING: "Proceed to Screening",
  NEEDS_VERIFICATION: "Needs Verification",
  KEEP_AS_POSSIBLE: "Keep as Possible",
  REDIRECT_CANDIDATE: "Redirect Candidate",
  DO_NOT_PURSUE_FOR_THIS_JOB: "Do Not Pursue for This Job",
};

export interface Workspace {
  id: string;
  owner_user_id: string;
  tenant_id: string;
  job_ref: string | null;
  job_title: string | null;
  msp_or_client: string | null;
  specialty: string | null;
  department: string | null;
  location: string | null;
  shift: string | null;
  start_date: string | null;
  job_status: JobStatus;
  workspace_status: WorkspaceStatus;
  structured_requirements: StructuredJobFields;
  job_description_text: string | null;
  job_description_quality: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSummary extends Workspace {
  candidate_count: number;
  analyzed_count: number;
  strong_matches: number;
  ready_to_submit: number;
}

export interface Candidate {
  id: string;
  owner_user_id: string;
  tenant_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  location: string | null;
  extracted_resume_text: string | null;
  ocr_confidence: number | null;
  extraction_quality: string | null;
  recruiter_notes: string | null;
  verified_information: VerifiedRecruiterInputs;
  created_at: string;
  updated_at: string;
}

export interface EntityFile {
  id: string;
  entity_type: "job_workspace" | "candidate";
  entity_id: string;
  owner_user_id: string;
  file_name: string;
  file_type: string | null;
  mime_type: string | null;
  byte_size: number | null;
  storage_path: string | null;
  is_image: boolean;
  page_order: number;
  extracted_text: string | null;
  extraction_method: string | null;
  extraction_quality: string | null;
  ocr_confidence: number | null;
  needs_review: boolean;
  created_at: string;
}

export interface RankedCandidateRow {
  job_match_candidate_id: string;
  candidate_id: string;
  full_name: string | null;
  status: CandidatePipelineStatus;
  latest_analysis_id: string | null;
  match_score: number | null;
  match_category: string | null;
  submission_readiness: string | null;
  recommended_action: string | null;
  confidence_score: number | null;
  mandatory_confirmed: number | null;
  mandatory_verify: number | null;
  mandatory_not_met: number | null;
  disposition: string | null;
  analyzed_at: string | null;
  updated_at: string;
}
