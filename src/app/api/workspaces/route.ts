import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import {
  createWorkspace,
  listWorkspacesPage,
  type WorkspaceInput,
} from "@/lib/dal/workspaces";
import { normalizeSearchQuery } from "@/lib/candidate-crm";
import type { StructuredJobFields } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody extends WorkspaceInput {
  structured_requirements?: StructuredJobFields;
}

export async function GET(req: NextRequest) {
  return withTenantUser("workspaces.list", async (user) => {
    const url = new URL(req.url);
    const search = normalizeSearchQuery(url.searchParams.get("q") ?? "");
    const status = (url.searchParams.get("status") ?? "active").toLowerCase();
    const includeArchived = status === "archived" || status === "all";
    const pageRaw = Number(url.searchParams.get("page") ?? "1");
    const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "0");
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
        ? Math.floor(pageSizeRaw)
        : undefined;

    const result = await listWorkspacesPage(user, {
      includeArchived,
      search: search || undefined,
      page: pageSize ? page : undefined,
      pageSize,
    });

    let items = result.items;
    if (status === "archived") {
      items = items.filter((w) => w.workspace_status === "ARCHIVED");
    }

    return ok({
      workspaces: items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      q: search || null,
    });
  });
}

export async function POST(req: NextRequest) {
  return withTenantUser("workspaces.create", async (user) => {
    const body = (await req.json()) as CreateBody;
    if (!body.job_description_text || !body.job_description_text.trim()) {
      return fail("A job description is required to create a workspace.", 400, "MISSING_JD");
    }
    const id = await createWorkspace(user, body);
    return ok({ id });
  });
}
