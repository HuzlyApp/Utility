import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard job workspace search UI", () => {
  it("places search beside the Job Workspaces heading with required UX", () => {
    const section = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "dashboard",
        "dashboard-job-workspaces.tsx"
      ),
      "utf8"
    );
    const input = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "job-search-input.tsx"),
      "utf8"
    );
    const dashboard = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "dashboard", "page.tsx"),
      "utf8"
    );

    expect(dashboard).toContain("DashboardJobWorkspaces");
    expect(dashboard).toContain("searchParams");
    expect(section).toContain("Job Workspaces");
    expect(section).toContain('placeholder="Search jobs by title or job code"');
    expect(section).toContain("No job workspaces match your search.");
    expect(section).toContain("Clear search");
    expect(section).toContain("Searching…");
    expect(input).toContain("SearchIcon");
    expect(input).toContain("Clear");
    expect(input).toContain("sr-only");
    expect(input).toContain("DEBOUNCE_MS = 350");
    expect(input).toContain('resetPageParam = "page"');
  });
});

describe("workspace listing API search contract", () => {
  it("accepts q and pagination query params on GET /api/workspaces", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "workspaces", "route.ts"),
      "utf8"
    );
    expect(route).toContain("export async function GET");
    expect(route).toContain('url.searchParams.get("q")');
    expect(route).toContain('url.searchParams.get("page")');
    expect(route).toContain('url.searchParams.get("pageSize")');
    expect(route).toContain("withTenantUser");
    expect(route).toContain("listWorkspacesPage");
  });

  it("filters authorized tenant workspaces across searchable fields", () => {
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "workspaces.ts"),
      "utf8"
    );
    expect(dal).toContain("tenant_id = ${tenantId}");
    expect(dal).toContain("job_title ILIKE");
    expect(dal).toContain("job_ref ILIKE");
    expect(dal).toContain("msp_or_client ILIKE");
    expect(dal).toContain("department ILIKE");
    expect(dal).toContain("location ILIKE");
    expect(dal).toContain("LIMIT ${pageSize");
    expect(dal).toContain("OFFSET ${offset}");
  });
});

describe("workspace search indexes migration", () => {
  it("adds trigram indexes for partial job search", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "workspace-search-indexes.sql"),
      "utf8"
    );
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain("idx_workspaces_tenant_job_ref_trgm");
    expect(sql).toContain("idx_workspaces_tenant_job_title_trgm");
    expect(sql).toContain("gin_trgm_ops");
  });
});
