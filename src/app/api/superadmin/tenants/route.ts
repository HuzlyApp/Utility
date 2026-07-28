import type { NextRequest } from "next/server";
import { ok, fail, logServerError } from "@/lib/http";
import { withRole } from "@/lib/api-helpers";
import { createTenant, getTenantBySlug, listTenants } from "@/lib/dal/tenants";
import { createCredentialUser, upsertUserProfile } from "@/lib/auth/provision";
import { audit } from "@/lib/dal/audit";
import { getUserProfileByEmail } from "@/lib/dal/users";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withRole("superadmin.tenants.list", "SUPER_ADMIN", async () => {
    const tenants = await listTenants();
    return ok({ tenants });
  });
}

export async function POST(req: NextRequest) {
  return withRole("superadmin.tenants.create", "SUPER_ADMIN", async (user) => {
    try {
      const body = (await req.json()) as {
        tenant_name?: string;
        tenant_slug?: string;
        tenant_admin_full_name?: string;
        tenant_admin_email?: string;
        temporary_password?: string;
        account_status?: "ACTIVE" | "SUSPENDED";
      };

      const tenantName = (body.tenant_name ?? "").trim();
      const tenantSlug = (body.tenant_slug ?? "").trim().toLowerCase();
      const adminName = (body.tenant_admin_full_name ?? "").trim();
      const adminEmail = (body.tenant_admin_email ?? "").trim().toLowerCase();
      const temporaryPassword = body.temporary_password ?? "";
      const status = body.account_status ?? "ACTIVE";

      if (!tenantName || !tenantSlug || !adminName || !adminEmail || !temporaryPassword) {
        return fail("Missing required fields.", 400, "MISSING_FIELDS");
      }
      if (!SLUG_REGEX.test(tenantSlug)) {
        return fail("Tenant slug must use lowercase letters, numbers, and hyphens.", 400, "INVALID_SLUG");
      }
      if (temporaryPassword.length < 8) {
        return fail("Temporary password must be at least 8 characters.", 400, "WEAK_PASSWORD");
      }
      const existingTenant = await getTenantBySlug(tenantSlug);
      if (existingTenant) {
        return fail("Tenant slug already exists. Choose a different slug.", 409, "TENANT_SLUG_TAKEN");
      }
      const existingUser = await getUserProfileByEmail(adminEmail);
      if (existingUser) {
        return fail("A user with that email already exists.", 409, "ADMIN_EMAIL_TAKEN");
      }

      const tenant = await createTenant({
        actor: user,
        name: tenantName,
        slug: tenantSlug,
        status,
      });

      const createdUser = await createCredentialUser({
        email: adminEmail,
        password: temporaryPassword,
        name: adminName,
        role: "admin",
      });
      if (!createdUser.created) {
        return fail("A user with that email already exists.", 409, "ADMIN_EMAIL_TAKEN");
      }

      await upsertUserProfile({
        userId: createdUser.userId,
        tenantId: tenant.id,
        email: adminEmail,
        fullName: adminName,
        role: "TENANT_ADMIN",
        status: "ACTIVE",
        mustChangePassword: true,
      });

      await audit({
        actorUserId: user.id,
        tenantId: tenant.id,
        entityType: "user",
        entityId: createdUser.userId,
        action: "TENANT_ADMIN_CREATED",
        newValue: {
          tenant_id: tenant.id,
          role: "TENANT_ADMIN",
          email: adminEmail,
        },
      });

      return ok({
        tenant,
        tenant_admin: {
          user_id: createdUser.userId,
          full_name: adminName,
          email: adminEmail,
          must_change_password: true,
        },
        credentials_once: {
          login: adminEmail,
          temporary_password: temporaryPassword,
        },
      });
    } catch (err) {
      const pgCode = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : "";
      const message =
        typeof err === "object" && err && "message" in err ? String((err as { message?: unknown }).message ?? "") : "";
      if (pgCode === "23505" && message.includes("tenants_slug_key")) {
        return fail("Tenant slug already exists. Choose a different slug.", 409, "TENANT_SLUG_TAKEN");
      }
      logServerError("superadmin.tenants.create", err);
      return fail("Could not create tenant workspace.", 500, "SERVER_ERROR");
    }
  });
}
