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
  tenantId: string
): Promise<TenantUserRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT user_id, tenant_id, email, full_name, role, status, must_change_password,
           last_login_at, created_at, updated_at
    FROM user_profiles
    WHERE tenant_id = ${tenantId}
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
    action: params.status === "ACTIVE" ? "USER_ENABLED" : "USER_DISABLED",
    newValue: { status: params.status },
  });
}
