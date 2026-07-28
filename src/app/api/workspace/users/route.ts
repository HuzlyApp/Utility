import type { NextRequest } from "next/server";
import { withRole } from "@/lib/api-helpers";
import { fail, ok, logServerError } from "@/lib/http";
import { listTenantUsers, setUserStatus } from "@/lib/dal/users";
import { createCredentialUser, upsertUserProfile } from "@/lib/auth/provision";
import { audit } from "@/lib/dal/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withRole("workspace.users.list", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    const users = await listTenantUsers(user.tenantId);
    return ok({ users });
  });
}

export async function POST(req: NextRequest) {
  return withRole("workspace.users.create", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    try {
      const body = (await req.json()) as {
        full_name?: string;
        email?: string;
        role?: "TENANT_ADMIN" | "RECRUITER" | "VIEWER";
        temporary_password?: string;
      };
      const fullName = (body.full_name ?? "").trim();
      const email = (body.email ?? "").trim().toLowerCase();
      const role = body.role ?? "RECRUITER";
      const tempPassword = body.temporary_password ?? "";

      if (!fullName || !email || tempPassword.length < 8) {
        return fail("Missing required fields.", 400, "MISSING_FIELDS");
      }
      if (!["TENANT_ADMIN", "RECRUITER", "VIEWER"].includes(role)) {
        return fail("Invalid role.", 400, "INVALID_ROLE");
      }

      const createdUser = await createCredentialUser({
        email,
        password: tempPassword,
        name: fullName,
        role: role === "TENANT_ADMIN" ? "admin" : "user",
      });
      await upsertUserProfile({
        userId: createdUser.userId,
        tenantId: user.tenantId,
        email,
        fullName,
        role,
        status: "ACTIVE",
        mustChangePassword: true,
      });
      await setUserStatus({
        actor: user,
        userId: createdUser.userId,
        status: "ACTIVE",
      });

      await audit({
        actorUserId: user.id,
        tenantId: user.tenantId,
        entityType: "user",
        entityId: createdUser.userId,
        action: "TENANT_USER_CREATED",
        newValue: { role, email },
      });

      return ok({
        user_id: createdUser.userId,
        credentials_once: {
          login: email,
          temporary_password: tempPassword,
        },
      });
    } catch (err) {
      logServerError("workspace.users.create", err);
      return fail("Could not create tenant user.", 500, "SERVER_ERROR");
    }
  });
}
