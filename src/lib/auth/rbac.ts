import type { AppRole } from "@/lib/auth/session";

export function isSuperAdmin(role: AppRole): boolean {
  return role === "SUPER_ADMIN";
}

export function canManageTenant(role: AppRole): boolean {
  return role === "TENANT_ADMIN" || role === "SUPER_ADMIN";
}

export function canAccessTenantWorkspace(role: AppRole): boolean {
  return role !== "SUPER_ADMIN";
}

export function resolvePostLoginPath(role: AppRole): string {
  return role === "SUPER_ADMIN" ? "/superadmin" : "/dashboard";
}
