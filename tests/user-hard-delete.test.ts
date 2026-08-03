import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("tenant user hard delete", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/dal/users.ts"), "utf8");

  it("permanently removes Neon Auth credentials and profile", () => {
    expect(src).toContain("USER_HARD_DELETED");
    expect(src).toContain('DELETE FROM neon_auth.session');
    expect(src).toContain('DELETE FROM neon_auth.account');
    expect(src).toContain('DELETE FROM neon_auth.member');
    expect(src).toContain('DELETE FROM neon_auth."user"');
    expect(src).toContain("DELETE FROM user_profiles");
    expect(src).not.toContain("SET status = 'ARCHIVED'");
  });

  it("clears relational user references in the tenant", () => {
    expect(src).toContain("assigned_recruiter_id = NULL");
    expect(src).toContain("updated_by_user_id = NULL");
    expect(src).toContain("last_status_changed_by_user_id = NULL");
    expect(src).toContain("created_by_user_id = NULL");
    expect(src).toContain("author_user_id = NULL");
    expect(src).toContain("performed_by_user_id = NULL");
    expect(src).toContain("decided_by = NULL");
    expect(src).toContain("DELETE FROM analysis_in_flight");
    expect(src).toContain("relation may not exist");
  });
});
