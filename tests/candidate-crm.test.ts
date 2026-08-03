import { describe, expect, it } from "vitest";
import {
  assertSameTenant,
  canEditNote,
  formatActivitySummary,
  shouldRecordStatusChange,
} from "@/lib/candidate-crm";
import { canManageTenant } from "@/lib/auth/rbac";

describe("candidate CRM status change rules", () => {
  it("skips history when status did not change", () => {
    expect(shouldRecordStatusChange("abc", "abc")).toBe(false);
    expect(shouldRecordStatusChange(null, "abc")).toBe(true);
    expect(shouldRecordStatusChange("abc", "def")).toBe(true);
  });
});

describe("candidate note permissions", () => {
  it("allows authors to edit their own notes", () => {
    expect(
      canEditNote({
        authorUserId: "u1",
        actorUserId: "u1",
        actorRole: "RECRUITER",
      })
    ).toBe(true);
  });

  it("blocks recruiters from editing others notes", () => {
    expect(
      canEditNote({
        authorUserId: "u1",
        actorUserId: "u2",
        actorRole: "RECRUITER",
      })
    ).toBe(false);
  });

  it("allows tenant admins to manage others notes", () => {
    expect(
      canEditNote({
        authorUserId: "u1",
        actorUserId: "admin",
        actorRole: "TENANT_ADMIN",
      })
    ).toBe(true);
  });
});

describe("activity summaries", () => {
  it("formats status changes with previous and new values", () => {
    expect(
      formatActivitySummary({
        actionType: "STATUS_CHANGED",
        previousValue: "Pending Review",
        newValue: "Qualified",
      })
    ).toBe('Status changed from "Pending Review" to "Qualified"');
  });

  it("formats assignment changes", () => {
    expect(
      formatActivitySummary({
        actionType: "CANDIDATE_ASSIGNED",
        previousValue: null,
        newValue: "Maria Santos",
      })
    ).toContain("Maria Santos");
  });
});

describe("cross-tenant protection helpers", () => {
  it("rejects mismatched tenant ids", () => {
    expect(assertSameTenant("tenant-a", "tenant-b")).toBe(false);
    expect(assertSameTenant("tenant-a", "tenant-a")).toBe(true);
    expect(assertSameTenant(null, "tenant-a")).toBe(false);
  });
});

describe("status settings RBAC", () => {
  it("recruiters cannot manage status options", () => {
    expect(canManageTenant("RECRUITER")).toBe(false);
    expect(canManageTenant("TENANT_ADMIN")).toBe(true);
    expect(canManageTenant("SUPER_ADMIN")).toBe(true);
  });
});
