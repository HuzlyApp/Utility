import type { NextRequest } from "next/server";
import { withRole } from "@/lib/api-helpers";
import { fail, ok, logServerError } from "@/lib/http";
import { getSql } from "@/lib/dal/client";
import { setUserMustChangePassword, setUserStatus } from "@/lib/dal/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  return withRole("workspace.users.patch", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    try {
      const body = (await req.json()) as {
        status?: "ACTIVE" | "SUSPENDED";
        must_change_password?: boolean;
      };
      const sql = getSql();
      const tenantUser = (await sql`
        SELECT user_id
        FROM user_profiles
        WHERE user_id = ${params.userId}
          AND tenant_id = ${user.tenantId}
        LIMIT 1
      `) as Array<{ user_id: string }>;
      if (tenantUser.length === 0) return fail("User not found.", 404, "NOT_FOUND");

      if (body.status) {
        await setUserStatus({
          actor: user,
          userId: params.userId,
          status: body.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
        });
      }
      if (typeof body.must_change_password === "boolean") {
        await setUserMustChangePassword({
          actor: user,
          userId: params.userId,
          mustChangePassword: body.must_change_password,
        });
      }
      return ok({});
    } catch (err) {
      logServerError("workspace.users.patch", err);
      return fail("Could not update user.", 500, "SERVER_ERROR");
    }
  });
}
