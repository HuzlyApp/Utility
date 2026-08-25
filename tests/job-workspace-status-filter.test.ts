import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceSummary } from "@/lib/dal/types";
import {
  filterWorkspacesForTab,
  isActiveListWorkspace,
  isArchivedWorkspace,
  isClosedJob,
  normalizeJobStatus,
  normalizeWorkspaceStatus,
  splitWorkspaces,
} from "@/lib/workspace-lists";

function ws(
  partial: Partial<WorkspaceSummary> & {
    id: string;
    job_status: WorkspaceSummary["job_status"];
    workspace_status: WorkspaceSummary["workspace_status"];
  }
): WorkspaceSummary {
  return {
    owner_user_id: "u1",
    tenant_id: "t1",
    job_ref: null,
    job_title: partial.job_title ?? partial.id,
    msp_or_client: null,
    specialty: null,
    department: null,
    location: null,
    shift: null,
    start_date: null,
    structured_requirements: {},
    job_description_text: null,
    job_description_quality: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    candidate_count: 0,
    analyzed_count: 0,
    strong_matches: 0,
    ready_to_submit: 0,
    ...partial,
  };
}

describe("job status normalization", () => {
  it("normalizes casing and legacy aliases safely", () => {
    expect(normalizeJobStatus("closed")).toBe("CLOSED");
    expect(normalizeJobStatus("CLOSED")).toBe("CLOSED");
    expect(normalizeJobStatus(" close ")).toBe("CLOSED");
    expect(normalizeJobStatus("active")).toBe("OPEN");
    expect(normalizeJobStatus("on-hold")).toBe("ON_HOLD");
    expect(normalizeJobStatus("ONHOLD")).toBe("ON_HOLD");
    expect(normalizeJobStatus(null)).toBeNull();
    expect(normalizeJobStatus("nope")).toBeNull();

    expect(normalizeWorkspaceStatus("archived")).toBe("ARCHIVED");
    expect(normalizeWorkspaceStatus("ARCHIVE")).toBe("ARCHIVED");
    expect(normalizeWorkspaceStatus("open")).toBe("ACTIVE");
    expect(normalizeWorkspaceStatus("ACTIVE")).toBe("ACTIVE");
  });
});

describe("canonical Active / Archived / All classification", () => {
  const open = ws({ id: "open", job_status: "OPEN", workspace_status: "ACTIVE" });
  const onHold = ws({
    id: "hold",
    job_status: "ON_HOLD",
    workspace_status: "ACTIVE",
  });
  const filled = ws({
    id: "filled",
    job_status: "FILLED",
    workspace_status: "ACTIVE",
  });
  const closed = ws({
    id: "closed",
    job_status: "CLOSED",
    workspace_status: "ACTIVE",
  });
  const closedLower = ws({
    id: "closed-lower",
    job_status: "CLOSED",
    workspace_status: "ACTIVE",
  });
  const archivedOpen = ws({
    id: "arch-open",
    job_status: "OPEN",
    workspace_status: "ARCHIVED",
  });
  const archivedClosed = ws({
    id: "arch-closed",
    job_status: "CLOSED",
    workspace_status: "ARCHIVED",
  });

  const all = [
    open,
    onHold,
    filled,
    closed,
    closedLower,
    archivedOpen,
    archivedClosed,
  ];

  it("includes open (and on-hold / filled) jobs under Active", () => {
    expect(isActiveListWorkspace(open)).toBe(true);
    expect(isActiveListWorkspace(onHold)).toBe(true);
    expect(isActiveListWorkspace(filled)).toBe(true);
    expect(filterWorkspacesForTab(all, "active").map((w) => w.id)).toEqual([
      "open",
      "hold",
      "filled",
    ]);
  });

  it("excludes closed jobs from Active", () => {
    expect(isClosedJob(closed)).toBe(true);
    expect(isActiveListWorkspace(closed)).toBe(false);
    expect(filterWorkspacesForTab(all, "active").some((w) => w.id === "closed")).toBe(
      false
    );
  });

  it("excludes archived jobs from Active", () => {
    expect(isArchivedWorkspace(archivedOpen)).toBe(true);
    expect(isActiveListWorkspace(archivedOpen)).toBe(false);
    expect(isActiveListWorkspace(archivedClosed)).toBe(false);
  });

  it("shows closed non-archived jobs under All but not Archived", () => {
    const allTab = filterWorkspacesForTab(all, "all");
    expect(allTab.some((w) => w.id === "closed")).toBe(true);
    expect(filterWorkspacesForTab(all, "archived").some((w) => w.id === "closed")).toBe(
      false
    );
  });

  it("shows archived jobs under Archived and All", () => {
    const archived = filterWorkspacesForTab(all, "archived");
    expect(archived.map((w) => w.id).sort()).toEqual(["arch-closed", "arch-open"]);
    expect(filterWorkspacesForTab(all, "all").length).toBe(all.length);
  });

  it("keeps Active count aligned with the Active filtered list", () => {
    const { active, archived, closed: closedBucket } = splitWorkspaces(all);
    expect(active.length).toBe(filterWorkspacesForTab(all, "active").length);
    expect(archived.length).toBe(filterWorkspacesForTab(all, "archived").length);
    expect(closedBucket.every(isClosedJob)).toBe(true);
    expect(closedBucket.every((w) => !isArchivedWorkspace(w))).toBe(true);
  });

  it("does not let sorting/search change classification predicates", () => {
    const shuffled = [...all].reverse();
    expect(filterWorkspacesForTab(shuffled, "active").map((w) => w.id).sort()).toEqual([
      "filled",
      "hold",
      "open",
    ]);
  });

  it("treats null job_status as OPEN for Active membership", () => {
    expect(
      isActiveListWorkspace({
        workspace_status: "ACTIVE",
        job_status: null,
      })
    ).toBe(true);
  });
});

describe("jobs page and API use shared Active predicate", () => {
  it("loads Active tab via listStatus active and a matching heading", () => {
    const jobsPage = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "jobs", "page.tsx"),
      "utf8"
    );
    const sections = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "dashboard",
        "job-workspace-sections.tsx"
      ),
      "utf8"
    );
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "workspaces.ts"),
      "utf8"
    );
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "workspaces", "route.ts"),
      "utf8"
    );

    expect(jobsPage).toContain('listStatus');
    expect(jobsPage).toContain('"active"');
    expect(sections).toContain("JOB_LIST_STATUS_HEADINGS");
    expect(dal).toContain("UPPER(COALESCE(w.job_status, 'OPEN')) <> 'CLOSED'");
    expect(dal).toContain("UPPER(COALESCE(job_status, 'OPEN')) <> 'CLOSED'");
    expect(route).toContain("listStatusFromParam");
    expect(route).toContain("parseJobStatusParam");
  });

  it("invalidates list views after job edits via router.refresh", () => {
    const form = readFileSync(
      join(process.cwd(), "src", "components", "jobs", "create-job-form.tsx"),
      "utf8"
    );
    const tiles = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "job-tiles.tsx"),
      "utf8"
    );
    expect(form).toContain("router.refresh()");
    expect(tiles).toContain("router.refresh()");
  });
});
