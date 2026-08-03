import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser, withRole } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import {
  createCandidateStatus,
  deleteCandidateStatus,
  listCandidateStatuses,
  reorderCandidateStatuses,
  updateCandidateStatus,
} from "@/lib/dal/statuses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withTenantUser("settings.statuses.get", async (user) => {
    const statuses = await listCandidateStatuses(user, { includeInactive: true });
    return ok({ statuses });
  });
}

export async function POST(req: NextRequest) {
  return withRole("settings.statuses.post", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    try {
      const body = (await req.json()) as {
        name?: string;
        color?: string | null;
        displayOrder?: number;
        isDefault?: boolean;
      };
      const status = await createCandidateStatus(user, {
        name: body.name ?? "",
        color: body.color,
        displayOrder: body.displayOrder,
        isDefault: body.isDefault,
      });
      return ok({ status }, 201);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, err.status === 409 ? "DUPLICATE" : "FORBIDDEN");
      }
      throw err;
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withRole("settings.statuses.patch", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    try {
      const body = (await req.json()) as {
        statusId?: string;
        name?: string;
        color?: string | null;
        displayOrder?: number;
        isActive?: boolean;
        isDefault?: boolean;
        orderedIds?: string[];
      };

      if (Array.isArray(body.orderedIds)) {
        await reorderCandidateStatuses(user, body.orderedIds);
        const statuses = await listCandidateStatuses(user, { includeInactive: true });
        return ok({ statuses });
      }

      const statusId = (body.statusId ?? "").trim();
      if (!statusId) return fail("statusId is required.", 400, "MISSING_STATUS");

      const status = await updateCandidateStatus(user, statusId, {
        name: body.name,
        color: body.color,
        displayOrder: body.displayOrder,
        isActive: body.isActive,
        isDefault: body.isDefault,
      });
      if (!status) return fail("Status not found.", 404, "NOT_FOUND");
      return ok({ status });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, err.status === 409 ? "DUPLICATE" : "FORBIDDEN");
      }
      throw err;
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withRole("settings.statuses.delete", "TENANT_ADMIN", async (user) => {
    if (!user.tenantId) return fail("Tenant context is required.", 403, "FORBIDDEN");
    try {
      const url = new URL(req.url);
      let statusId = (url.searchParams.get("statusId") ?? "").trim();
      if (!statusId) {
        const body = (await req.json().catch(() => ({}))) as { statusId?: string };
        statusId = (body.statusId ?? "").trim();
      }
      if (!statusId) return fail("statusId is required.", 400, "MISSING_STATUS");

      const result = await deleteCandidateStatus(user, statusId);
      return ok({ deleted: true, statusId, name: result.name });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(
          err.message,
          err.status,
          err.status === 404 ? "NOT_FOUND" : err.status === 400 ? "DELETE_BLOCKED" : "FORBIDDEN"
        );
      }
      throw err;
    }
  });
}
