// Idempotent initial-admin bootstrap (spec §1).
//
// Creates the Neon Auth user admin@utility.com ONLY when it does not already
// exist, promotes it to the ADMIN role, and links a user_profiles record with
// must_change_password = true. The temporary password is sent ONLY to the Neon
// Auth server (Better Auth) and is never written to any application table.
//
// Usage: node scripts/bootstrap-admin.mjs
import { neon } from "@neondatabase/serverless";
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
const BASE = (process.env.NEON_AUTH_BASE_URL ?? process.env.AUTH_URL ?? "").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@utility.com";
const PASSWORD = process.env.ADMIN_INITIAL_PASSWORD ?? "admin2026!";
const NAME = "Utility Admin";

if (!DB) throw new Error("DATABASE_URL is not set.");
if (!BASE) throw new Error("NEON_AUTH_BASE_URL is not set.");

const sql = neon(DB);
const run = (stmt, ...params) => {
  const strings = params.length
    ? undefined
    : Object.assign([stmt], { raw: [stmt] });
  return strings ? sql(strings) : sqlParams(stmt, params);
};
function sqlParams(text, params) {
  // Build a tagged-template call so parameters are safely bound.
  const chunks = text.split(/\$\d+/);
  const raw = chunks.slice();
  return sql(Object.assign(chunks, { raw }), ...params);
}

async function findUser(email) {
  const rows = await run(
    `SELECT id, email, role FROM neon_auth."user" WHERE lower(email) = lower($1) LIMIT 1`,
    email
  );
  return rows[0] ?? null;
}

async function main() {
  let user = await findUser(EMAIL);

  if (!user) {
    console.log(`Creating Neon Auth user ${EMAIL} ...`);
    const origin = process.env.BOOTSTRAP_ORIGIN ?? "http://localhost:3000";
    const res = await fetch(`${BASE}/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        referer: origin + "/",
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
    });
    if (!res.ok) {
      const body = await res.text();
      // If a race created it, fall through to lookup; otherwise fail loudly.
      if (!/exist/i.test(body)) {
        throw new Error(`Sign-up failed (${res.status}): ${body}`);
      }
    }
    user = await findUser(EMAIL);
    if (!user) throw new Error("User was not created by the auth server.");
  } else {
    console.log(`User ${EMAIL} already exists; not overwriting.`);
  }

  // Promote to admin role in Neon Auth (idempotent).
  if (user.role !== "admin") {
    await run(
      `UPDATE neon_auth."user" SET role = $1, "updatedAt" = now() WHERE id = $2`,
      "admin",
      user.id
    );
    console.log("Set Neon Auth role = admin.");
  }

  // Link an app profile with must_change_password on first creation only.
  const existing = await run(
    `SELECT user_id, must_change_password FROM user_profiles WHERE user_id = $1`,
    user.id
  );
  if (existing.length === 0) {
    await run(
      `INSERT INTO user_profiles (user_id, email, full_name, role, must_change_password)
       VALUES ($1, $2, $3, 'ADMIN', true)`,
      user.id,
      EMAIL,
      NAME
    );
    console.log("Created user_profiles row (must_change_password = true).");
  } else {
    // Ensure the role mirror is ADMIN but never touch must_change_password.
    await run(
      `UPDATE user_profiles SET role = 'ADMIN', email = $1, updated_at = now() WHERE user_id = $2`,
      EMAIL,
      user.id
    );
    console.log("Profile already exists; left must_change_password unchanged.");
  }

  await run(
    `INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, new_value_json)
     VALUES ($1, 'user', $2, 'ADMIN_BOOTSTRAP', $3)`,
    user.id,
    user.id,
    JSON.stringify({ email: EMAIL, role: "ADMIN" })
  );

  console.log(`\nAdmin ready: ${EMAIL} (user id ${user.id}).`);
  console.log("Sign in with the temporary password, then change it on first login.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
