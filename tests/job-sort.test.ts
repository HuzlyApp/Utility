import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_JOB_SORT,
  DEFAULT_JOB_SORT_DIR,
  parseJobSortDirParam,
  parseJobSortParam,
} from "@/lib/workspace-lists";

describe("job list sort params", () => {
  it("defaults to last updated, newest first", () => {
    expect(parseJobSortParam(undefined)).toBe(DEFAULT_JOB_SORT);
    expect(parseJobSortParam("nope")).toBe("updated");
    expect(parseJobSortParam("created")).toBe("created");
    expect(parseJobSortDirParam(undefined)).toBe(DEFAULT_JOB_SORT_DIR);
    expect(parseJobSortDirParam("asc")).toBe("asc");
    expect(parseJobSortDirParam("desc")).toBe("desc");
  });
});

describe("job list sort UI and query", () => {
  it("exposes date-created sort options next to search", () => {
    const select = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "dashboard",
        "job-sort-select.tsx"
      ),
      "utf8"
    );
    const jobsPage = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "jobs", "page.tsx"),
      "utf8"
    );

    expect(select).toContain("Date created (newest)");
    expect(select).toContain("Date created (oldest)");
    expect(select).toContain("Last updated");
    expect(select).toContain('value: "created:desc"');
    expect(jobsPage).toContain("JobSortSelect");
    expect(jobsPage).toContain("sort,");
    expect(jobsPage).toContain("dir,");
  });

  it("orders workspaces by created_at when sort=created", () => {
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "workspaces.ts"),
      "utf8"
    );
    expect(dal).toContain("w.created_at");
    expect(dal).toContain("opts?.sort === \"created\"");
    expect(dal).toContain("CASE WHEN ${sortKey} = 'created'");
  });
});
