/**
 * Centralized dashboard / workspace route helpers.
 * Paths follow the app's existing `/jobs` and `/candidates` conventions
 * (equivalent to the `/dashboard/jobs` and `/dashboard/candidates` destinations
 * described in the navigation spec).
 */

export const jobRoutes = {
  list: (
    statusOrOpts?:
      | "active"
      | "archived"
      | "all"
      | { status?: "active" | "archived" | "all"; q?: string }
  ) => {
    const opts =
      typeof statusOrOpts === "string" || statusOrOpts == null
        ? { status: statusOrOpts }
        : statusOrOpts;
    const status = opts.status;
    const q = opts.q?.trim();
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  },
  workspace: (jobId: string) => `/jobs/${jobId}`,
  addCandidates: (jobId: string) => `/jobs/${jobId}/candidates/add`,
  edit: (jobId: string) => `/jobs/${jobId}/edit`,
};

export const candidateRoutes = {
  list: (filter?: CandidateListFilter) =>
    filter && filter !== "all" ? `/candidates?filter=${filter}` : "/candidates",
  detail: (candidateId: string, workspaceId?: string | null) =>
    workspaceId
      ? `/candidates/${candidateId}?w=${workspaceId}`
      : `/candidates/${candidateId}`,
};

export const dashboardStatRoutes = {
  activeJobs: jobRoutes.list("active"),
  totalCandidates: candidateRoutes.list(),
  strongMatches: candidateRoutes.list("strong"),
  needsVerification: candidateRoutes.list("needs-verification"),
  readyToSubmit: candidateRoutes.list("ready-to-submit"),
} as const;

export const CANDIDATE_LIST_FILTERS = [
  "all",
  "strong",
  "needs-verification",
  "ready-to-submit",
] as const;

export type CandidateListFilter = (typeof CANDIDATE_LIST_FILTERS)[number];

export const JOB_LIST_STATUSES = ["active", "archived", "all"] as const;
export type JobListStatus = (typeof JOB_LIST_STATUSES)[number];

export function parseCandidateFilterParam(
  value: string | string[] | null | undefined
): CandidateListFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "strong" ||
    raw === "needs-verification" ||
    raw === "ready-to-submit"
  ) {
    return raw;
  }
  return "all";
}

export function parseJobStatusParam(
  value: string | string[] | null | undefined
): JobListStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "active" || raw === "archived" || raw === "all") return raw;
  return "active";
}

/** Maps a URL filter to the analysis fields used by dashboard stats. */
export function candidateFilterToSql(
  filter: CandidateListFilter
): { matchCategory?: string; submissionReadiness?: string } {
  switch (filter) {
    case "strong":
      return { matchCategory: "STRONG_MATCH" };
    case "needs-verification":
      return { submissionReadiness: "VERIFY_BEFORE_SUBMISSION" };
    case "ready-to-submit":
      return { submissionReadiness: "READY_TO_SUBMIT" };
    default:
      return {};
  }
}

export const CANDIDATE_FILTER_LABELS: Record<CandidateListFilter, string> = {
  all: "All candidates",
  strong: "Strong matches",
  "needs-verification": "Needs verification",
  "ready-to-submit": "Ready to submit",
};

/**
 * Call from nested action controls so a parent card's navigation handler
 * does not also fire.
 */
export function isolateCardAction<E extends { stopPropagation: () => void }>(
  event: E,
  action?: () => void
): void {
  event.stopPropagation();
  action?.();
}

export function jobCardNavigation(
  jobId: string,
  opts?: { archived?: boolean }
): {
  canNavigate: boolean;
  workspaceHref: string | null;
  actions: {
    openWorkspace: string;
    addCandidates: string;
    edit: string;
  };
} {
  const archived = Boolean(opts?.archived);
  return {
    canNavigate: !archived,
    workspaceHref: archived ? null : jobRoutes.workspace(jobId),
    actions: {
      openWorkspace: jobRoutes.workspace(jobId),
      addCandidates: jobRoutes.addCandidates(jobId),
      edit: jobRoutes.edit(jobId),
    },
  };
}
