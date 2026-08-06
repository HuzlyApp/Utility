import { describe, expect, it } from "vitest";
import {
  canAccessTenantWorkspace,
  canManageTenant,
  canViewCandidateContact,
  isSuperAdmin,
  resolvePostLoginPath,
} from "@/lib/auth/rbac";

describe("rbac helpers", () => {
  it("identifies super admin role correctly", () => {
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(isSuperAdmin("TENANT_ADMIN")).toBe(false);
  });

  it("tenant management permissions are restricted", () => {
    expect(canManageTenant("SUPER_ADMIN")).toBe(true);
    expect(canManageTenant("TENANT_ADMIN")).toBe(true);
    expect(canManageTenant("RECRUITER")).toBe(false);
    expect(canManageTenant("VIEWER")).toBe(false);
  });

  it("super admins do not use tenant workspace routes", () => {
    expect(canAccessTenantWorkspace("SUPER_ADMIN")).toBe(false);
    expect(canAccessTenantWorkspace("TENANT_ADMIN")).toBe(true);
  });

  it("post-login route is role aware", () => {
    expect(resolvePostLoginPath("SUPER_ADMIN")).toBe("/superadmin");
    expect(resolvePostLoginPath("TENANT_ADMIN")).toBe("/dashboard");
  });

  it("restricts candidate contact details for viewers", () => {
    expect(canViewCandidateContact("VIEWER")).toBe(false);
    expect(canViewCandidateContact("RECRUITER")).toBe(true);
  });
});
