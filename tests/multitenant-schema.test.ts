import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("multi-tenant schema migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "scripts", "multi-tenant-schema.sql"),
    "utf8"
  );

  it("creates tenants table with unique slug", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS tenants");
    expect(sql).toContain("slug TEXT NOT NULL UNIQUE");
  });

  it("backfills a default tenant", () => {
    expect(sql).toContain("Default Workspace");
    expect(sql).toContain("slug = 'default'");
  });

  it("adds tenant FK columns to tenant-owned tables", () => {
    expect(sql).toContain("ALTER TABLE job_match_workspaces");
    expect(sql).toContain("ALTER TABLE candidates");
    expect(sql).toContain("ALTER TABLE candidate_match_analyses");
    expect(sql).toContain("ALTER TABLE audit_logs");
  });

  it("enforces tenant scoped email uniqueness", () => {
    expect(sql).toContain("user_profiles_tenant_email_unique");
  });
});
