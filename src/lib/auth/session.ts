import "server-only";
import { auth } from "./server";
import { getSql } from "@/lib/dal/client";
import { ensureDefaultSuperAdmin } from "@/lib/auth/superadmin-seed";

export type AppRole = "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER";
export type AppUserStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  status: AppUserStatus;
  mustChangePassword: boolean;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED" | null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

interface RawSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

async function readSessionUser(): Promise<RawSessionUser | null> {
  const { data } = await auth.getSession();
  const user = data?.user as RawSessionUser | undefined;
  if (!user?.id) return null;
  return user;
}

function normalizeRole(role: string | null | undefined): AppRole {
  const value = (role ?? "").toUpperCase();
  if (value === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (value === "TENANT_ADMIN" || value === "ADMIN") return "TENANT_ADMIN";
  if (value === "VIEWER") return "VIEWER";
  return "RECRUITER";
}

function normalizeStatus(status: string | null | undefined): AppUserStatus {
  const value = (status ?? "").toUpperCase();
  if (value === "SUSPENDED") return "SUSPENDED";
  if (value === "ARCHIVED") return "ARCHIVED";
  return "ACTIVE";
}

function normalizeTenantStatus(
  status: string | null | undefined
): "ACTIVE" | "SUSPENDED" | "ARCHIVED" | null {
  if (!status) return null;
  const value = status.toUpperCase();
  if (value === "SUSPENDED") return "SUSPENDED";
  if (value === "ARCHIVED") return "ARCHIVED";
  return "ACTIVE";
}

// Ensures a user_profiles row exists for the authenticated user and returns
// tenant-aware role + status context for server-side authorization checks.
async function loadProfile(user: RawSessionUser): Promise<AppUser> {
  await ensureDefaultSuperAdmin();
  const sql = getSql();
  const authRole = (user.role ?? "").toLowerCase() === "admin" ? "TENANT_ADMIN" : "RECRUITER";

  let rows = (await sql`
    SELECT
      up.user_id, up.email, up.full_name, up.role, up.status,
      up.must_change_password, up.tenant_id,
      t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
    FROM user_profiles up
    LEFT JOIN tenants t ON t.id = up.tenant_id
    WHERE up.user_id = ${user.id}
  `) as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    status: string;
    must_change_password: boolean;
    tenant_id: string | null;
    tenant_name: string | null;
    tenant_slug: string | null;
    tenant_status: string | null;
  }>;

  if (rows.length === 0) {
    rows = (await sql`
      INSERT INTO user_profiles (
        user_id, email, full_name, role, status, must_change_password, tenant_id
      )
      VALUES (
        ${user.id},
        ${user.email ?? null},
        ${user.name ?? null},
        ${authRole},
        'ACTIVE',
        false,
        (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
      )
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
      RETURNING user_id, email, full_name, role, status, must_change_password, tenant_id,
        NULL::text AS tenant_name, NULL::text AS tenant_slug, NULL::text AS tenant_status
    `) as typeof rows;
  }

  const profile = rows[0];
  const role = normalizeRole(profile.role);
  const status = normalizeStatus(profile.status);
  const tenantStatus = normalizeTenantStatus(profile.tenant_status);

  if (status !== "ACTIVE") {
    throw new AuthError("Your account is not active.", 403);
  }
  if (role !== "SUPER_ADMIN" && tenantStatus && tenantStatus !== "ACTIVE") {
    throw new AuthError("Your tenant is not active.", 403);
  }

  return {
    id: user.id,
    email: user.email ?? profile.email ?? "",
    name: user.name ?? profile.full_name,
    role,
    status,
    mustChangePassword: Boolean(profile.must_change_password),
    tenantId: profile.tenant_id ?? null,
    tenantName: profile.tenant_name ?? null,
    tenantSlug: profile.tenant_slug ?? null,
    tenantStatus,
  };
}

// Returns the current app user or null (does not throw). For pages.
export async function getCurrentUser(): Promise<AppUser | null> {
  const user = await readSessionUser();
  if (!user) return null;
  return loadProfile(user);
}

// Throws AuthError(401) when unauthenticated. For API routes / server actions.
export async function requireUser(): Promise<AppUser> {
  const user = await readSessionUser();
  if (!user) throw new AuthError("Authentication required.", 401);
  return loadProfile(user);
}

// Throws 401 when unauthenticated, 403 when the role is insufficient.
export async function requireRole(role: AppRole): Promise<AppUser> {
  const user = await requireUser();
  if (role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new AuthError("You do not have permission to perform this action.", 403);
  }
  if (
    role === "TENANT_ADMIN" &&
    user.role !== "SUPER_ADMIN" &&
    user.role !== "TENANT_ADMIN"
  ) {
    throw new AuthError("You do not have permission to perform this action.", 403);
  }
  return user;
}

// Clears the must_change_password flag after a successful password change.
export async function clearMustChangePassword(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE user_profiles SET must_change_password = false, updated_at = now()
    WHERE user_id = ${userId}
  `;
}

export function assertTenantUser(user: AppUser): asserts user is AppUser & { tenantId: string } {
  if (!user.tenantId) {
    throw new AuthError("Tenant context is required.", 403);
  }
}
