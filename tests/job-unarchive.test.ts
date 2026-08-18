import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("job unarchive", () => {
  it("exposes an Unarchive action on archived job tiles", () => {
    const tiles = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "job-tiles.tsx"),
      "utf8"
    );

    expect(tiles).toContain('"Unarchive"');
    expect(tiles).toContain("Unarchive job workspace?");
    expect(tiles).toContain("Job restored to active jobs.");
    expect(tiles).toContain('workspace_status: next');
    expect(tiles).toContain('next: "ACTIVE"');
  });

  it("restores jobs by setting workspace status to ACTIVE without rewriting job fields", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "workspaces",
        "[workspaceId]",
        "route.ts"
      ),
      "utf8"
    );
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "workspaces.ts"),
      "utf8"
    );

    expect(route).toContain('workspace_status === "ACTIVE"');
    expect(route).toContain("setWorkspaceStatus");
    expect(route).toContain("hasWorkspaceUpdates");
    expect(dal).toContain('status === "ARCHIVED" ? "WORKSPACE_ARCHIVED" : "WORKSPACE_RESTORED"');
    expect(dal).toContain(
      "UPDATE job_match_workspaces SET workspace_status = ${status}, updated_at = now()"
    );
  });

  it("lists archived jobs in a dedicated section on the dashboard and jobs page", () => {
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
    const jobsPage = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "jobs", "page.tsx"),
      "utf8"
    );
    const dashboard = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "dashboard",
        "dashboard-job-workspaces.tsx"
      ),
      "utf8"
    );

    expect(sections).toContain('title="Archived Jobs"');
    expect(sections).toContain('title="Active Jobs"');
    expect(jobsPage).toContain("JobWorkspaceSections");
    expect(jobsPage).toContain("showArchived");
    expect(dashboard).toContain("ArchivedJobsSection");
  });
});
