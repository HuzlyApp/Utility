import type { AiResult } from "./schema";
import type {
  StructuredJobFields,
  VerifiedRecruiterInputs,
} from "./types";

export type { AiResult };

export interface MandatorySummary {
  confirmed: number;
  to_verify: number;
  not_met: number;
}

export interface AnalyzeResponse {
  success: true;
  analysis_id: string | null;
  grok_result: AiResult;
  validated_result: AiResult;
  score_adjustments: string[];
  mandatory_summary: MandatorySummary;
  created_at: string;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

// The full recruiter-entered state carried across the wizard, and reused for
// reanalysis.
export interface JobInputState {
  job_id: string;
  job_title: string;
  msp_name: string;
  job_description_text: string;
  structured: StructuredJobFields;
}

export interface CandidateInputState {
  resume_text: string;
  candidate_name: string;
  recruiter_notes: string;
  verified: VerifiedRecruiterInputs;
}
