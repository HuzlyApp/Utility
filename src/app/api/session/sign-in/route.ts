import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { ok, fail, logServerError } from "@/lib/http";
import { getSql } from "@/lib/dal/client";
import { audit } from "@/lib/dal/audit";
import { ensureDefaultSuperAdmin } from "@/lib/auth/superadmin-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await ensureDefaultSuperAdmin();
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return fail("Enter your email and password.", 400, "MISSING_FIELDS");
    }
    const { error } = await auth.signIn.email({
      email,
      password,
      // Keep users signed in across tabs/direct links until session expiry.
      rememberMe: true,
    });
    if (error) {
      // Do not reveal whether the email exists.
      await audit({
        actorUserId: null,
        entityType: "auth",
        entityId: null,
        action: "LOGIN_FAILED",
        newValue: { email },
      });
      return fail("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }
    const { data } = await auth.getSession();
    const user = data?.user as { id?: string } | undefined;
    if (user?.id) {
      const sql = getSql();
      const rows = (await sql`
        SELECT role, status, tenant_id
        FROM user_profiles
        WHERE user_id = ${user.id}
        LIMIT 1
      `) as Array<{ role: string; status: string; tenant_id: string | null }>;
      const profile = rows[0];
      if (profile && profile.status !== "ACTIVE") {
        await auth.signOut();
        return fail("Invalid email or password.", 401, "INVALID_CREDENTIALS");
      }
      if (profile && profile.role !== "SUPER_ADMIN" && !profile.tenant_id) {
        await auth.signOut();
        return fail("Invalid email or password.", 401, "INVALID_CREDENTIALS");
      }
      await sql`
        UPDATE user_profiles
        SET last_login_at = now(), updated_at = now()
        WHERE user_id = ${user.id}
      `;
      await audit({
        actorUserId: user.id,
        tenantId: profile?.tenant_id ?? undefined,
        entityType: "auth",
        entityId: user.id,
        action: "LOGIN_SUCCEEDED",
      });
    }
    return ok({});
  } catch (err) {
    logServerError("sign-in", err);
    return fail("Sign in failed. Please try again.", 500, "SERVER_ERROR");
  }
}
