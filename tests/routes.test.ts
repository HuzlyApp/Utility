import { describe, expect, it, vi } from "vitest";
import {
  candidateFilterToSql,
  candidateRoutes,
  dashboardStatRoutes,
  isolateCardAction,
  jobCardNavigation,
  jobRoutes,
  parseCandidateFilterParam,
  parseJobStatusParam,
} from "@/lib/routes";

describe("jobRoutes", () => {
  it("builds workspace and action paths from the database job id", () => {
    expect(jobRoutes.workspace("ws-123")).toBe("/jobs/ws-123");
    expect(jobRoutes.addCandidates("ws-123")).toBe(
      "/jobs/ws-123/candidates/add"
    );
    expect(jobRoutes.edit("ws-123")).toBe("/jobs/ws-123/edit");
  });

  it("builds list urls with optional status query", () => {
    expect(jobRoutes.list()).toBe("/jobs");
    expect(jobRoutes.list("active")).toBe("/jobs?status=active");
    expect(jobRoutes.list("archived")).toBe("/jobs?status=archived");
    expect(jobRoutes.list("all")).toBe("/jobs");
  });

  it("preserves search query when switching status tabs", () => {
    expect(jobRoutes.list({ status: "active", q: "icu" })).toBe(
      "/jobs?status=active&q=icu"
    );
    expect(jobRoutes.list({ status: "all", q: "JOB-1" })).toBe("/jobs?q=JOB-1");
  });
});

describe("dashboardStatRoutes", () => {
  it("maps each dashboard statistic to the correct filtered destination", () => {
    expect(dashboardStatRoutes.activeJobs).toBe("/jobs?status=active");
    expect(dashboardStatRoutes.totalCandidates).toBe("/candidates");
    expect(dashboardStatRoutes.strongMatches).toBe(
      "/candidates?filter=strong"
    );
    expect(dashboardStatRoutes.needsVerification).toBe(
      "/candidates?filter=needs-verification"
    );
    expect(dashboardStatRoutes.readyToSubmit).toBe(
      "/candidates?filter=ready-to-submit"
    );
  });
});

describe("candidateRoutes", () => {
  it("builds list urls with optional filter query", () => {
    expect(candidateRoutes.list()).toBe("/candidates");
    expect(candidateRoutes.list("all")).toBe("/candidates");
    expect(candidateRoutes.list("strong")).toBe("/candidates?filter=strong");
  });

  it("builds detail urls with optional workspace query", () => {
    expect(candidateRoutes.detail("c1")).toBe("/candidates/c1");
    expect(candidateRoutes.detail("c1", "w1")).toBe("/candidates/c1?w=w1");
  });
});

describe("query filter initialization", () => {
  it("parses candidate filter query params and ignores unknown values", () => {
    expect(parseCandidateFilterParam("strong")).toBe("strong");
    expect(parseCandidateFilterParam("needs-verification")).toBe(
      "needs-verification"
    );
    expect(parseCandidateFilterParam("ready-to-submit")).toBe(
      "ready-to-submit"
    );
    expect(parseCandidateFilterParam(undefined)).toBe("all");
    expect(parseCandidateFilterParam("nope")).toBe("all");
    expect(parseCandidateFilterParam(["strong", "all"])).toBe("strong");
  });

  it("maps filters to the same analysis fields used by dashboard stats", () => {
    expect(candidateFilterToSql("strong")).toEqual({
      matchCategory: "STRONG_MATCH",
    });
    expect(candidateFilterToSql("needs-verification")).toEqual({
      submissionReadiness: "VERIFY_BEFORE_SUBMISSION",
    });
    expect(candidateFilterToSql("ready-to-submit")).toEqual({
      submissionReadiness: "READY_TO_SUBMIT",
    });
    expect(candidateFilterToSql("all")).toEqual({});
  });

  it("parses job status query params with an active default", () => {
    expect(parseJobStatusParam("active")).toBe("active");
    expect(parseJobStatusParam("archived")).toBe("archived");
    expect(parseJobStatusParam("all")).toBe("all");
    expect(parseJobStatusParam(undefined)).toBe("active");
    expect(parseJobStatusParam("open")).toBe("active");
  });
});

describe("job card navigation and event isolation", () => {
  it("allows workspace navigation for active jobs", () => {
    const nav = jobCardNavigation("abc");
    expect(nav.canNavigate).toBe(true);
    expect(nav.workspaceHref).toBe("/jobs/abc");
    expect(nav.actions.openWorkspace).toBe("/jobs/abc");
    expect(nav.actions.addCandidates).toBe("/jobs/abc/candidates/add");
    expect(nav.actions.edit).toBe("/jobs/abc/edit");
  });

  it("disables parent card navigation for archived jobs", () => {
    const nav = jobCardNavigation("abc", { archived: true });
    expect(nav.canNavigate).toBe(false);
    expect(nav.workspaceHref).toBeNull();
    expect(nav.actions.openWorkspace).toBe("/jobs/abc");
  });

  it("stops event propagation so action clicks do not open the workspace", () => {
    const stopPropagation = vi.fn();
    const action = vi.fn();
    isolateCardAction({ stopPropagation }, action);
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
  });

  it("can isolate without running an action callback", () => {
    const stopPropagation = vi.fn();
    isolateCardAction({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
