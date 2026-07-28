import type { NextRequest } from "next/server";
import { withRole } from "@/lib/api-helpers";
import { fail, ok, logServerError } from "@/lib/http";
import { getTenantById, updateTenantName, updateTenantStatus } from "@/lib/dal/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  return withRole("superadmin.tenants.get", "SUPER_ADMIN", async () => {
    const tenant = await getTenantById(params.tenantId);
    if (!tenant) return fail("Tenant not found.", 404, "NOT_FOUND");
    return ok({ tenant });
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  return withRole("superadmin.tenants.patch", "SUPER_ADMIN", async (user) => {
    try {
      const body = (await req.json()) as {
        name?: string;
        status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
      };

      if (typeof body.name === "string" && body.name.trim()) {
        const updated = await updateTenantName({
          actor: user,
          tenantId: params.tenantId,
          name: body.name,
        });
        if (!updated) return fail("Tenant not found.", 404, "NOT_FOUND");
      }
      if (body.status) {
        const updated = await updateTenantStatus({
          actor: user,
          tenantId: params.tenantId,
          status: body.status,
        });
        if (!updated) return fail("Tenant not found.", 404, "NOT_FOUND");
      }

      const tenant = await getTenantById(params.tenantId);
      if (!tenant) return fail("Tenant not found.", 404, "NOT_FOUND");
      return ok({ tenant });
    } catch (err) {
      logServerError("superadmin.tenants.patch", err);
      return fail("Could not update tenant.", 500, "SERVER_ERROR");
    }
  });
}
