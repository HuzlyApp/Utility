import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("candidate CRM schema migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "scripts", "candidate-crm-schema.sql"),
    "utf8"
  );

  it("creates tenant-scoped status, notes, and activity tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS candidate_statuses");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS candidate_notes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS candidate_activity_logs");
  });

  it("adds CRM columns to candidates", () => {
    expect(sql).toContain("current_status_id");
    expect(sql).toContain("assigned_recruiter_id");
    expect(sql).toContain("created_by_user_id");
    expect(sql).toContain("updated_by_user_id");
    expect(sql).toContain("last_status_changed_by_user_id");
  });

  it("prevents duplicate status names per tenant", () => {
    expect(sql).toContain("idx_candidate_statuses_tenant_name");
    expect(sql).toContain("lower(name)");
  });

  it("seeds default statuses and migrates legacy notes", () => {
    expect(sql).toContain("'New / Not Contacted'");
    expect(sql).toContain("'Attempted Contact'");
    expect(sql).toContain("'Qualified-Ready for 2nd Interview'");
    expect(sql).toContain("INSERT INTO candidate_notes");
    expect(sql).toContain("recruiter_notes");
  });
});
