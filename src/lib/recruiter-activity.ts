/**
 * Pure helpers for recruiter productivity metrics (unit-testable without DB).
 */

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "custom";

export type ActivitySource =
  | "recruiter"
  | "tenant_admin"
  | "super_admin"
  | "system"
  | "migration"
  | "api";

export const RECRUITER_ACTIVITY_ACTIONS = [
  "USER_LOGIN",
  "CANDIDATE_CREATED",
  "CANDIDATE_IMPORTED",
  "CANDIDATE_ASSIGNED",
  "CANDIDATE_REASSIGNED",
  "RESUME_UPLOADED",
  "RESUME_REPLACED",
  "RESUME_DOWNLOADED",
  "DUPLICATE_WARNING_ACCEPTED",
  "ANALYSIS_STARTED",
  "ANALYSIS_COMPLETED",
  "ANALYSIS_FAILED",
  "ANALYSIS_RERUN",
  "ASSESSMENT_DOWNLOADED",
  "NOTE_ADDED",
  "NOTE_EDITED",
  "NOTE_DELETED",
  "STATUS_CHANGED",
  "CANDIDATE_ADDED_TO_JOB",
  "CANDIDATE_REMOVED_FROM_JOB",
  "CANDIDATE_QUALIFIED",
  "CANDIDATE_SUBMITTED",
  "CANDIDATE_SUBMITTED_TO_JOB",
  "INTERVIEW_SCHEDULED",
  "OFFER_EXTENDED",
  "CANDIDATE_HIRED",
  "CANDIDATE_REJECTED",
  "CANDIDATE_ON_HOLD",
  "CANDIDATE_UNREACHABLE",
  "DISPOSITION_UPDATED",
  "JOB_CREATED",
  "JOB_EDITED",
  "JOB_ARCHIVED",
  "JOB_REOPENED",
] as const;

export type RecruiterActivityAction = (typeof RECRUITER_ACTIVITY_ACTIONS)[number];

/** Actions that count as working a candidate (excludes page views / login). */
export const MEANINGFUL_CANDIDATE_ACTIONS = new Set<string>([
  "STATUS_CHANGED",
  "NOTE_ADDED",
  "NOTE_EDITED",
  "ANALYSIS_COMPLETED",
  "ANALYSIS_RERUN",
  "RESUME_UPLOADED",
  "RESUME_REPLACED",
  "CANDIDATE_ASSIGNED",
  "CANDIDATE_REASSIGNED",
  "CANDIDATE_SUBMITTED",
  "CANDIDATE_SUBMITTED_TO_JOB",
  "INTERVIEW_SCHEDULED",
  "OFFER_EXTENDED",
  "CANDIDATE_HIRED",
  "CANDIDATE_REJECTED",
  "CANDIDATE_QUALIFIED",
  "CANDIDATE_ON_HOLD",
  "CANDIDATE_UNREACHABLE",
  "DISPOSITION_UPDATED",
  "CANDIDATE_ADDED_TO_JOB",
]);

export const DEFAULT_PRODUCTIVITY_WEIGHTS = {
  candidatesWorked: 0.2,
  analysesCompleted: 0.15,
  notesAndFollowUps: 0.15,
  statusProgression: 0.2,
  candidatesSubmitted: 0.15,
  interviewsOffersHires: 0.15,
} as const;

export type ProductivityWeights = {
  candidatesWorked: number;
  analysesCompleted: number;
  notesAndFollowUps: number;
  statusProgression: number;
  candidatesSubmitted: number;
  interviewsOffersHires: number;
};

export const PRODUCTIVITY_SCORE_TOOLTIP =
  "Weighted score (default): Candidates worked 20%, Analyses completed 15%, Notes & follow-ups 15%, Status progression 20%, Submitted 15%, Interviews/offers/hires 15%. Normalized against the top performer in the period. Duplicate notes and no-op status saves are not rewarded.";

export function sourceFromRole(
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER" | null | undefined
): ActivitySource {
  if (role === "SUPER_ADMIN") return "super_admin";
  if (role === "TENANT_ADMIN") return "tenant_admin";
  if (role === "VIEWER") return "api";
  return "recruiter";
}

export function canViewRecruiterActivity(params: {
  viewerRole: "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER";
  viewerUserId: string;
  viewerTenantId: string | null;
  targetRecruiterId: string | null;
  targetTenantId: string | null;
}): boolean {
  const { viewerRole, viewerUserId, viewerTenantId, targetRecruiterId, targetTenantId } =
    params;

  if (viewerRole === "SUPER_ADMIN") {
    return Boolean(targetTenantId);
  }

  if (!viewerTenantId || !targetTenantId || viewerTenantId !== targetTenantId) {
    return false;
  }

  if (viewerRole === "TENANT_ADMIN") return true;

  if (!targetRecruiterId) return false;
  return viewerUserId === targetRecruiterId;
}

export function resolveScopedRecruiterId(params: {
  viewerRole: "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER";
  viewerUserId: string;
  requestedRecruiterId?: string | null;
}): string | null {
  if (params.viewerRole === "TENANT_ADMIN" || params.viewerRole === "SUPER_ADMIN") {
    return params.requestedRecruiterId ?? null;
  }
  return params.viewerUserId;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resolveDateRange(
  preset: DatePreset,
  opts?: { now?: Date; customFrom?: string; customTo?: string }
): { from: Date; to: Date; previousFrom: Date; previousTo: Date } {
  const now = opts?.now ?? new Date();
  const todayStart = startOfDayUtc(now);

  let from: Date;
  let to: Date;

  switch (preset) {
    case "today":
      from = todayStart;
      to = addDaysUtc(todayStart, 1);
      break;
    case "yesterday":
      from = addDaysUtc(todayStart, -1);
      to = todayStart;
      break;
    case "last_7_days":
      from = addDaysUtc(todayStart, -6);
      to = addDaysUtc(todayStart, 1);
      break;
    case "last_30_days":
      from = addDaysUtc(todayStart, -29);
      to = addDaysUtc(todayStart, 1);
      break;
    case "this_month":
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      to = addDaysUtc(todayStart, 1);
      break;
    case "last_month": {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    }
    case "custom": {
      if (!opts?.customFrom || !opts?.customTo) {
        throw new Error("Custom date range requires from and to.");
      }
      from = startOfDayUtc(new Date(opts.customFrom));
      to = addDaysUtc(startOfDayUtc(new Date(opts.customTo)), 1);
      break;
    }
    default:
      from = addDaysUtc(todayStart, -6);
      to = addDaysUtc(todayStart, 1);
  }

  const durationMs = to.getTime() - from.getTime();
  const previousTo = from;
  const previousFrom = new Date(from.getTime() - durationMs);

  return { from, to, previousFrom, previousTo };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function isMeaningfulCandidateAction(actionType: string): boolean {
  return MEANINGFUL_CANDIDATE_ACTIONS.has(actionType);
}

export function mapDispositionToActivityType(disposition: string): string {
  switch (disposition) {
    case "PROCEED_TO_SCREENING":
      return "CANDIDATE_QUALIFIED";
    case "DO_NOT_PURSUE_FOR_THIS_JOB":
      return "CANDIDATE_REJECTED";
    default:
      return "DISPOSITION_UPDATED";
  }
}

export function mapStatusNameToActivityType(statusName: string): string | null {
  const lower = statusName.toLowerCase();
  if (lower.includes("qualified") || lower.includes("approved")) {
    return "CANDIDATE_QUALIFIED";
  }
  if (lower.includes("selected") || lower.includes("hired") || lower.includes("placed")) {
    return "CANDIDATE_HIRED";
  }
  if (lower.includes("reject") || lower.includes("disqualified") || lower.includes("withdrew")) {
    return "CANDIDATE_REJECTED";
  }
  if (lower.includes("unreachable")) {
    return "CANDIDATE_UNREACHABLE";
  }
  if (lower.includes("follow-up") || lower.includes("hold") || lower.includes("callback")) {
    return "CANDIDATE_ON_HOLD";
  }
  if (lower.includes("interview")) {
    return "INTERVIEW_SCHEDULED";
  }
  return null;
}

export interface RecruiterMetricCounts {
  candidatesAdded: number;
  candidatesWorked: number;
  analysesCompleted: number;
  notesAdded: number;
  statusChanges: number;
  qualified: number;
  submitted: number;
  interviews: number;
  offers: number;
  hired: number;
  rejected: number;
}

export function computeProductivityScore(
  counts: RecruiterMetricCounts,
  maxes: RecruiterMetricCounts,
  weights: ProductivityWeights = DEFAULT_PRODUCTIVITY_WEIGHTS
): number {
  const norm = (value: number, max: number) => (max <= 0 ? 0 : Math.min(1, value / max));

  const score =
    weights.candidatesWorked * norm(counts.candidatesWorked, maxes.candidatesWorked) +
    weights.analysesCompleted * norm(counts.analysesCompleted, maxes.analysesCompleted) +
    weights.notesAndFollowUps * norm(counts.notesAdded, maxes.notesAdded) +
    weights.statusProgression * norm(counts.statusChanges, maxes.statusChanges) +
    weights.candidatesSubmitted * norm(counts.submitted, maxes.submitted) +
    weights.interviewsOffersHires *
      norm(
        counts.interviews + counts.offers + counts.hired,
        maxes.interviews + maxes.offers + maxes.hired
      );

  return Math.round(score * 1000) / 10;
}

export function averageFollowUpHours(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  const avg = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
  return Math.round((avg / (1000 * 60 * 60)) * 10) / 10;
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  if (Number.isNaN(diffMs)) return "—";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatFeedDescription(params: {
  recruiterName: string;
  actionType: string;
  candidateName?: string | null;
  jobTitle?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  matchScore?: number | null;
}): string {
  const who = params.recruiterName || "Someone";
  const cand = params.candidateName || "a candidate";
  const job = params.jobTitle;

  switch (params.actionType) {
    case "NOTE_ADDED":
      return `${who} added a note to ${cand}`;
    case "NOTE_EDITED":
      return `${who} edited a note on ${cand}`;
    case "NOTE_DELETED":
      return `${who} deleted a note on ${cand}`;
    case "STATUS_CHANGED":
      return `${who} moved ${cand} from "${params.previousValue ?? "—"}" to "${params.newValue ?? "—"}"`;
    case "ANALYSIS_COMPLETED": {
      const score =
        params.matchScore != null ? `, ${Math.round(params.matchScore)}% match` : "";
      const against = job ? ` against ${job}` : "";
      return `${who} completed an analysis for ${cand}${against}${score}`;
    }
    case "ANALYSIS_STARTED":
      return `${who} started an analysis for ${cand}`;
    case "ANALYSIS_FAILED":
      return `${who}'s analysis failed for ${cand}`;
    case "CANDIDATE_CREATED":
      return `${who} added candidate ${cand}`;
    case "CANDIDATE_ASSIGNED":
    case "CANDIDATE_REASSIGNED":
      return `${who} assigned ${cand} to ${params.newValue ?? "a recruiter"}`;
    case "CANDIDATE_SUBMITTED":
    case "CANDIDATE_SUBMITTED_TO_JOB":
      return `${who} submitted ${cand}${job ? ` to ${job}` : ""}`;
    case "CANDIDATE_QUALIFIED":
      return `${who} qualified ${cand}`;
    case "CANDIDATE_HIRED":
      return `${who} hired ${cand}`;
    case "CANDIDATE_REJECTED":
      return `${who} rejected ${cand}`;
    case "INTERVIEW_SCHEDULED":
      return `${who} scheduled an interview for ${cand}`;
    case "OFFER_EXTENDED":
      return `${who} extended an offer to ${cand}`;
    case "RESUME_UPLOADED":
      return `${who} uploaded a resume for ${cand}`;
    case "RESUME_REPLACED":
      return `${who} replaced the resume for ${cand}`;
    case "JOB_CREATED":
      return `${who} created job ${job ?? params.newValue ?? ""}`.trim();
    case "JOB_EDITED":
      return `${who} edited job ${job ?? params.newValue ?? ""}`.trim();
    case "JOB_ARCHIVED":
      return `${who} archived job ${job ?? params.newValue ?? ""}`.trim();
    case "JOB_REOPENED":
      return `${who} unarchived job ${job ?? params.newValue ?? ""}`.trim();
    case "USER_LOGIN":
      return `${who} signed in`;
    case "DISPOSITION_UPDATED":
      return `${who} updated disposition for ${cand}${params.newValue ? `: ${params.newValue}` : ""}`;
    default:
      return `${who} performed ${params.actionType.replace(/_/g, " ").toLowerCase()} on ${cand}`;
  }
}

export interface ActivityExportRow {
  recruiter_name: string;
  recruiter_email: string;
  activity_type: string;
  candidate: string;
  job: string;
  previous_value: string;
  new_value: string;
  timestamp: string;
  tenant: string;
  candidate_id: string;
  job_id: string;
  activity_id: string;
}

export function activityRowsToCsv(rows: ActivityExportRow[]): string {
  const headers = [
    "recruiter_name",
    "recruiter_email",
    "activity_type",
    "candidate",
    "job",
    "previous_value",
    "new_value",
    "timestamp",
    "tenant",
    "candidate_id",
    "job_id",
    "activity_id",
  ];
  const escape = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.recruiter_name,
        row.recruiter_email,
        row.activity_type,
        row.candidate,
        row.job,
        row.previous_value,
        row.new_value,
        row.timestamp,
        row.tenant,
        row.candidate_id,
        row.job_id,
        row.activity_id,
      ]
        .map((c) => escape(c ?? ""))
        .join(",")
    );
  }
  return lines.join("\n");
}

export interface ProductivityExportRow {
  recruiter_name: string;
  recruiter_email: string;
  role: string;
  assigned_candidates: number;
  candidates_added: number;
  candidates_worked: number;
  analyses_completed: number;
  notes_added: number;
  status_changes: number;
  qualified: number;
  submitted: number;
  interviews: number;
  offers: number;
  hired: number;
  rejected: number;
  avg_follow_up_hours: string;
  last_activity: string;
  productivity_score: string;
}

export function productivityRowsToCsv(rows: ProductivityExportRow[]): string {
  const headers = [
    "recruiter_name",
    "recruiter_email",
    "role",
    "assigned_candidates",
    "candidates_added",
    "candidates_worked",
    "analyses_completed",
    "notes_added",
    "status_changes",
    "qualified",
    "submitted",
    "interviews",
    "offers",
    "hired",
    "rejected",
    "avg_follow_up_hours",
    "last_activity",
    "productivity_score",
  ];
  const escape = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.recruiter_name,
        row.recruiter_email,
        row.role,
        String(row.assigned_candidates),
        String(row.candidates_added),
        String(row.candidates_worked),
        String(row.analyses_completed),
        String(row.notes_added),
        String(row.status_changes),
        String(row.qualified),
        String(row.submitted),
        String(row.interviews),
        String(row.offers),
        String(row.hired),
        String(row.rejected),
        row.avg_follow_up_hours,
        row.last_activity,
        row.productivity_score,
      ]
        .map((c) => escape(c ?? ""))
        .join(",")
    );
  }
  return lines.join("\n");
}

export const KPI_DEFINITIONS: Array<{
  key: string;
  label: string;
  tooltip: string;
}> = [
  {
    key: "activeRecruiters",
    label: "Active Recruiters",
    tooltip: "Distinct recruiters with at least one activity in the selected period.",
  },
  {
    key: "candidatesAdded",
    label: "Candidates Added",
    tooltip: "Unique candidates created by recruiters during the period.",
  },
  {
    key: "candidatesWorked",
    label: "Candidates Worked",
    tooltip:
      "Unique candidates with at least one meaningful action (status, note, analysis, resume, assignment, submission, interview, disposition).",
  },
  {
    key: "analysesCompleted",
    label: "Analyses Completed",
    tooltip: "Count of completed candidate analyses attributed to recruiters.",
  },
  {
    key: "notesAdded",
    label: "Notes Added",
    tooltip: "Count of candidate notes created by recruiters.",
  },
  {
    key: "statusChanges",
    label: "Status Changes",
    tooltip: "Valid status transitions where the status value actually changed.",
  },
  {
    key: "qualified",
    label: "Candidates Qualified",
    tooltip: "Candidates moved to a qualified stage or disposition.",
  },
  {
    key: "submitted",
    label: "Candidates Submitted",
    tooltip: "Candidates submitted to a job during the period.",
  },
  {
    key: "interviews",
    label: "Interviews Scheduled",
    tooltip: "Interview-related status or activity events.",
  },
  {
    key: "offers",
    label: "Offers Extended",
    tooltip: "Offer-extended activity events.",
  },
  {
    key: "hired",
    label: "Candidates Hired",
    tooltip: "Candidates marked hired or selected.",
  },
  {
    key: "rejected",
    label: "Candidates Rejected",
    tooltip: "Candidates rejected or marked do-not-pursue.",
  },
  {
    key: "avgFollowUpHours",
    label: "Average Follow-Up Time",
    tooltip:
      "Average hours between candidate assignment/creation and the recruiter’s first meaningful activity (excludes system actions).",
  },
  {
    key: "inactiveCandidates",
    label: "Candidates Without Recent Activity",
    tooltip: "Assigned candidates with no activity in the last 7 days.",
  },
];
