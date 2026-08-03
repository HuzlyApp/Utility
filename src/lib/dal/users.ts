import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import type { AppUser, AppRole } from "@/lib/auth/session";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface TenantUserRow {
  user_id: string;
  tenant_id: string | null;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  status: UserStatus;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listTenantUsers(
  tenantId: string,
  opts?: { includeArchived?: boolean }
): Promise<TenantUserRow[]> {
  const sql = getSql();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = (await sql`
    SELECT user_id, tenant_id, email, full_name, role, status, must_change_password,
           last_login_at, created_at, updated_at
    FROM user_profiles
    WHERE tenant_id = ${tenantId}
      AND (${includeArchived} OR status <> 'ARCHIVED')
    ORDER BY created_at DESC
  `) as TenantUserRow[];
  return rows;
}

export async function getUserProfileByEmail(email: string): Promise<TenantUserRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT user_id, tenant_id, email, full_name, role, status, must_change_password,
           last_login_at, created_at, updated_at
    FROM user_profiles
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `) as TenantUserRow[];
  return rows[0] ?? null;
}

export async function assignUserToTenant(params: {
  actor: AppUser;
  userId: string;
  tenantId: string | null;
  role: AppRole;
  status?: UserStatus;
  mustChangePassword?: boolean;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE user_profiles
    SET
      tenant_id = ${params.tenantId},
      role = ${params.role},
      status = ${params.status ?? "ACTIVE"},
      must_change_password = ${params.mustChangePassword ?? false},
      updated_at = now()
    WHERE user_id = ${params.userId}
  `;
  await audit({
    actorUserId: params.actor.id,
    tenantId: params.tenantId ?? undefined,
    entityType: "user",
    entityId: params.userId,
    action: "USER_ROLE_CHANGED",
    newValue: {
      role: params.role,
      tenant_id: params.tenantId,
      status: params.status ?? "ACTIVE",
    },
  });
}

export async function setUserMustChangePassword(params: {
  actor: AppUser;
  userId: string;
  mustChangePassword: boolean;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE user_profiles
    SET must_change_password = ${params.mustChangePassword}, updated_at = now()
    WHERE user_id = ${params.userId}
  `;
  await audit({
    actorUserId: params.actor.id,
    tenantId: params.actor.tenantId ?? undefined,
    entityType: "user",
    entityId: params.userId,
    action: params.mustChangePassword ? "USER_PASSWORD_RESET" : "USER_PASSWORD_UPDATED",
    newValue: { must_change_password: params.mustChangePassword },
  });
}

export async function setUserStatus(params: {
  actor: AppUser;
  userId: string;
  status: UserStatus;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE user_profiles
    SET status = ${params.status}, updated_at = now()
    WHERE user_id = ${params.userId}
  `;
  await audit({
    actorUserId: params.actor.id,
    tenantId: params.actor.tenantId ?? undefined,
    entityType: "user",
    entityId: params.userId,
    action:
      params.status === "ACTIVE"
        ? "USER_ENABLED"
        : params.status === "ARCHIVED"
          ? "USER_DELETED"
          : "USER_DISABLED",
    newValue: { status: params.status },
  });
}

/**
 * Soft-deletes a tenant user (ARCHIVED). Blocks self-delete and deleting the
 * last active tenant admin. Login is already denied for non-ACTIVE statuses.
 */
export async function deleteTenantUser(params: {
  actor: AppUser;
  userId: string;
  tenantId: string;
}): Promise<{ deleted: true; email: string | null; fullName: string | null }> {
  const sql = getSql();

  if (params.actor.id === params.userId) {
    throw new Error("You cannot delete your own account.");
  }

  const rows = (await sql`
    SELECT user_id, email, full_name, role, status
    FROM user_profiles
    WHERE user_id = ${params.userId}
      AND tenant_id = ${params.tenantId}
    LIMIT 1
  `) as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    role: AppRole;
    status: UserStatus;
  }>;
  const target = rows[0];
  if (!target) {
    throw new Error("User not found.");
  }
  if (target.status === "ARCHIVED") {
    throw new Error("User is already deleted.");
  }

  if (target.role === "TENANT_ADMIN") {
    const admins = (await sql`
      SELECT COUNT(*)::int AS count
      FROM user_profiles
      WHERE tenant_id = ${params.tenantId}
        AND role = 'TENANT_ADMIN'
        AND status = 'ACTIVE'
        AND user_id <> ${params.userId}
    `) as { count: number }[];
    if (Number(admins[0]?.count ?? 0) < 1 && target.status === "ACTIVE") {
      throw new Error(
        "Cannot delete the last active tenant admin. Promote another admin first."
      );
    }
  }

  await sql`
    UPDATE user_profiles
    SET status = 'ARCHIVED', updated_at = now()
    WHERE user_id = ${params.userId} AND tenant_id = ${params.tenantId}
  `;

  await audit({
    actorUserId: params.actor.id,
    tenantId: params.tenantId,
    entityType: "user",
    entityId: params.userId,
    action: "USER_DELETED",
    previousValue: {
      email: target.email,
      full_name: target.full_name,
      role: target.role,
      status: target.status,
    },
    newValue: {
      status: "ARCHIVED",
      admin_name: params.actor.name,
    },
  });

  return {
    deleted: true,
    email: target.email,
    fullName: target.full_name,
  };
}
