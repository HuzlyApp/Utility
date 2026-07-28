import type { NextRequest } from "next/server";
import { withTenantUser, withRole } from "@/lib/api-helpers";
import { fail, ok, logServerError } from "@/lib/http";
import { getTenantById, updateTenantName } from "@/lib/dal/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withTenantUser("workspace.settings.get", async (user) => {
    const tenant = await getTenantById(user.tenantId);
    if (!tenant) return fail("Tenant not found.", 404, "NOT_FOUND");
    return ok({ tenant });
  });
}

export async function PATCH(req: NextRequest) {
  return withRole("workspace.settings.patch", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    try {
      const body = (await req.json()) as { name?: string };
      const name = (body.name ?? "").trim();
      if (!name) return fail("Tenant name is required.", 400, "MISSING_NAME");
      const updated = await updateTenantName({
        actor: user,
        tenantId: user.tenantId,
        name,
      });
      if (!updated) return fail("Tenant not found.", 404, "NOT_FOUND");
      const tenant = await getTenantById(user.tenantId);
      return ok({ tenant });
    } catch (err) {
      logServerError("workspace.settings.patch", err);
      return fail("Could not update tenant settings.", 500, "SERVER_ERROR");
    }
  });
}
