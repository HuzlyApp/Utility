// Idempotent default SUPER_ADMIN seed for first-time setup.
// Usage: node scripts/seed-superadmin.mjs
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";
import fs from "node:fs";

function loadEnv() {
  const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const DB = process.env.DATABASE_URL;
const EMAIL = (process.env.DEFAULT_SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
const PASSWORD = process.env.DEFAULT_SUPERADMIN_PASSWORD ?? "";
const NAME = "BrassHR Super Admin";

if (!DB) throw new Error("DATABASE_URL is not set.");
if (!EMAIL || !PASSWORD) {
  throw new Error("DEFAULT_SUPERADMIN_EMAIL and DEFAULT_SUPERADMIN_PASSWORD are required.");
}
if (PASSWORD.length < 8) throw new Error("DEFAULT_SUPERADMIN_PASSWORD must be at least 8 chars.");

const sql = neon(DB);
const q = (strings, ...values) => sql(strings, ...values);

async function main() {
  const existingAdmin = await q`
    SELECT user_id FROM user_profiles WHERE role = 'SUPER_ADMIN' LIMIT 1
  `;
  if (existingAdmin.length > 0) {
    console.log("SUPER_ADMIN already exists. Seed is idempotent; no action taken.");
    return;
  }

  const users = await q`
    SELECT id FROM neon_auth."user"
    WHERE lower(email) = lower(${EMAIL})
    LIMIT 1
  `;

  let userId = users[0]?.id;
  if (!userId) {
    userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const hashed = await hashPassword(PASSWORD);
    await q`
      INSERT INTO neon_auth."user" (
        id, name, email, "emailVerified", role, "createdAt", "updatedAt"
      )
      VALUES (${userId}, ${NAME}, ${EMAIL}, true, 'admin', now(), now())
    `;
    await q`
      INSERT INTO neon_auth.account (
        id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
      )
      VALUES (${accountId}, ${EMAIL}, 'credential', ${userId}, ${hashed}, now(), now())
    `;
  }

  await q`
    INSERT INTO user_profiles (
      user_id, tenant_id, email, full_name, role, status, must_change_password
    )
    VALUES (
      ${userId},
      NULL,
      ${EMAIL},
      ${NAME},
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

  await q`
    INSERT INTO audit_logs (
      actor_user_id, entity_type, entity_id, action, new_value_json
    )
    VALUES (
      ${userId},
      'user',
      ${userId},
      'SUPER_ADMIN_CREATED',
      ${JSON.stringify({ email: EMAIL, role: "SUPER_ADMIN" })}
    )
  `;

  console.log(`SUPER_ADMIN ready: ${EMAIL}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
