import type { NextRequest } from "next/server";
import { withRole } from "@/lib/api-helpers";
import { fail, ok, logServerError } from "@/lib/http";
import { getSql } from "@/lib/dal/client";
import { setCredentialPassword } from "@/lib/auth/provision";
import { setUserMustChangePassword } from "@/lib/dal/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { tenantId: string; userId: string } }
) {
  return withRole("superadmin.tenant-user.reset-password", "SUPER_ADMIN", async (user) => {
    try {
      const body = (await req.json()) as { temporary_password?: string };
      const temporaryPassword = body.temporary_password ?? "";
      if (temporaryPassword.length < 8) {
        return fail("Temporary password must be at least 8 characters.", 400, "WEAK_PASSWORD");
      }

      const sql = getSql();
      const rows = (await sql`
        SELECT user_id
        FROM user_profiles
        WHERE user_id = ${params.userId}
          AND tenant_id = ${params.tenantId}
        LIMIT 1
      `) as Array<{ user_id: string }>;
      if (rows.length === 0) return fail("User not found.", 404, "NOT_FOUND");

      await setCredentialPassword(params.userId, temporaryPassword);
      await setUserMustChangePassword({
        actor: user,
        userId: params.userId,
        mustChangePassword: true,
      });

      return ok({
        credentials_once: {
          temporary_password: temporaryPassword,
        },
      });
    } catch (err) {
      logServerError("superadmin.tenant-user.reset-password", err);
      return fail("Could not reset password.", 500, "SERVER_ERROR");
    }
  });
}
