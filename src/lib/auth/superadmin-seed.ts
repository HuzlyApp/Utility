import "server-only";
import { getSql } from "@/lib/dal/client";
import { config } from "@/lib/config";
import { hashPassword } from "better-auth/crypto";
import { audit } from "@/lib/dal/audit";

let seeded = false;

function setupEnvIsRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function ensureDefaultSuperAdmin(): Promise<void> {
  if (seeded) return;
  const sql = getSql();

  const existing = (await sql`
    SELECT user_id
    FROM user_profiles
    WHERE role = 'SUPER_ADMIN'
    LIMIT 1
  `) as Array<{ user_id: string }>;
  if (existing.length > 0) {
    seeded = true;
    return;
  }

  const email = config.defaultSuperAdminEmail.trim().toLowerCase();
  const password = config.defaultSuperAdminPassword;

  if (!email || !password) {
    if (setupEnvIsRequired()) {
      throw new Error(
        "DEFAULT_SUPERADMIN_EMAIL and DEFAULT_SUPERADMIN_PASSWORD are required in production setup."
      );
    }
    return;
  }

  const authUsers = (await sql`
    SELECT id, email
    FROM neon_auth."user"
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `) as Array<{ id: string; email: string }>;

  let userId: string;
  if (authUsers.length === 0) {
    userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const hashed = await hashPassword(password);
    await sql.transaction((tx) => [
      tx`
        INSERT INTO neon_auth."user" (
          id, name, email, "emailVerified", role, "createdAt", "updatedAt"
        ) VALUES (
          ${userId},
          'BrassHR Super Admin',
          ${email},
          true,
          'admin',
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
  } else {
    userId = authUsers[0].id;
  }

  await sql`
    INSERT INTO user_profiles (
      user_id, tenant_id, email, full_name, role, status, must_change_password
    )
    VALUES (
      ${userId},
      NULL,
      ${email},
      'BrassHR Super Admin',
      'SUPER_ADMIN',
      'ACTIVE',
      true
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      role = 'SUPER_ADMIN',
      tenant_id = NULL,
      status = 'ACTIVE',
      must_change_password = true,
      updated_at = now()
  `;

  await audit({
    actorUserId: userId,
    entityType: "user",
    entityId: userId,
    action: "SUPER_ADMIN_CREATED",
    newValue: {
      role: "SUPER_ADMIN",
      email,
      tenant_id: null,
      seeded: true,
    },
  });

  seeded = true;
}
