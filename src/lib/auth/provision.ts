import "server-only";
import { getSql } from "@/lib/dal/client";
import { config } from "@/lib/config";
import type { AppRole } from "@/lib/auth/session";
import { hashPassword } from "better-auth/crypto";

export async function createCredentialUser(params: {
  email: string;
  password: string;
  name: string;
  role?: "admin" | "user";
}): Promise<{ userId: string; created: boolean }> {
  const sql = getSql();
  const email = params.email.trim().toLowerCase();

  const existing = (await sql`
    SELECT id FROM neon_auth."user"
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `) as Array<{ id: string }>;
  if (existing.length > 0) return { userId: existing[0].id, created: false };

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const hashed = await hashPassword(params.password);

  await sql.transaction((tx) => [
    tx`
      INSERT INTO neon_auth."user" (
        id, name, email, "emailVerified", role, "createdAt", "updatedAt"
      ) VALUES (
        ${userId},
        ${params.name},
        ${email},
        true,
        ${params.role ?? "user"},
        now(),
        now()
      )
    `,
    tx`
      INSERT INTO neon_auth.account (
        id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
      ) VALUES (
        ${accountId},
        ${email},
        'credential',
        ${userId},
        ${hashed},
        now(),
        now()
      )
    `,
  ]);

  return { userId, created: true };
}

export async function setCredentialPassword(userId: string, password: string): Promise<void> {
  const sql = getSql();
  const hashed = await hashPassword(password);
  await sql`
    UPDATE neon_auth.account
    SET password = ${hashed}, "updatedAt" = now()
    WHERE "userId" = ${userId} AND "providerId" = 'credential'
  `;
}

export async function upsertUserProfile(params: {
  userId: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  role: AppRole;
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  mustChangePassword?: boolean;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO user_profiles (
      user_id, tenant_id, email, full_name, role, status, must_change_password
    )
    VALUES (
      ${params.userId},
      ${params.tenantId},
      ${params.email.trim().toLowerCase()},
      ${params.fullName},
      ${params.role},
      ${params.status ?? "ACTIVE"},
      ${params.mustChangePassword ?? false}
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      must_change_password = EXCLUDED.must_change_password,
      updated_at = now()
  `;
}

export function requireDefaultSuperAdminEnv(): void {
  if (process.env.NODE_ENV === "production") {
    if (!config.defaultSuperAdminEmail || !config.defaultSuperAdminPassword) {
      throw new Error(
        "DEFAULT_SUPERADMIN_EMAIL and DEFAULT_SUPERADMIN_PASSWORD must be set in production."
      );
    }
  }
}
