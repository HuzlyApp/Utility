import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { listDashboardCandidates } from "@/lib/dal/candidates";
import {
  candidateFilterToSql,
  parseCandidateFilterParam,
} from "@/lib/routes";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import { normalizeSearchQuery } from "@/lib/candidate-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paginated-style candidate list for the Candidates page (SSR refresh / polling).
 * Query params mirror `/candidates` URL filters, including `search`.
 */
export async function GET(req: NextRequest) {
  return withTenantUser("candidates.list", async (user) => {
    const url = new URL(req.url);
    const filter = parseCandidateFilterParam(url.searchParams.get("filter"));
    const sqlFilter = candidateFilterToSql(filter);
    const search = normalizeSearchQuery(url.searchParams.get("search"));
    const canViewContact = canViewCandidateContact(user.role);

    const assignedRaw = url.searchParams.get("assigned");
    const assigned =
      assignedRaw === "unassigned" ? null : assignedRaw || undefined;
    const mine = url.searchParams.get("mine") === "1";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const candidates = await listDashboardCandidates(user, {
      ...sqlFilter,
      statusId: url.searchParams.get("status") || undefined,
      assignedRecruiterId: mine ? undefined : assigned,
      mine,
      createdByUserId: url.searchParams.get("createdBy") || undefined,
      updatedByUserId: url.searchParams.get("updatedBy") || undefined,
      workspaceId: url.searchParams.get("job") || undefined,
      dateFrom: from ? new Date(from).toISOString() : undefined,
      dateTo: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      search: search || undefined,
      searchContact: canViewContact,
    });

    return ok({
      candidates,
      total: candidates.length,
      can_view_contact: canViewContact,
    });
  });
}
