import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listDashboardCandidates } from "@/lib/dal/candidates";
import { listCandidateStatuses } from "@/lib/dal/statuses";
import { listTenantUsers } from "@/lib/dal/users";
import { listWorkspaces } from "@/lib/dal/workspaces";
import { CandidateList } from "@/components/dashboard/candidate-list";
import { CandidateListFilters } from "@/components/dashboard/candidate-list-filters";
import {
  CANDIDATE_FILTER_LABELS,
  CANDIDATE_LIST_FILTERS,
  candidateFilterToSql,
  candidateRoutes,
  parseCandidateFilterParam,
  type CandidateListFilter,
} from "@/lib/routes";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: {
    filter?: string;
    status?: string;
    assigned?: string;
    createdBy?: string;
    updatedBy?: string;
    job?: string;
    from?: string;
    to?: string;
    mine?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.tenantId) redirect("/dashboard");

  const filter = parseCandidateFilterParam(searchParams.filter);
  const sqlFilter = candidateFilterToSql(filter);

  const assigned =
    searchParams.assigned === "unassigned"
      ? null
      : searchParams.assigned || undefined;

  const [items, statuses, users, workspaces] = await Promise.all([
    listDashboardCandidates(user, {
      ...sqlFilter,
      statusId: searchParams.status || undefined,
      assignedRecruiterId: searchParams.mine === "1" ? undefined : assigned,
      mine: searchParams.mine === "1",
      createdByUserId: searchParams.createdBy || undefined,
      updatedByUserId: searchParams.updatedBy || undefined,
      workspaceId: searchParams.job || undefined,
      dateFrom: searchParams.from
        ? new Date(searchParams.from).toISOString()
        : undefined,
      dateTo: searchParams.to
        ? new Date(`${searchParams.to}T23:59:59`).toISOString()
        : undefined,
    }),
    listCandidateStatuses(user),
    listTenantUsers(user.tenantId),
    listWorkspaces(user),
  ]);

  const recruiters = users.filter(
    (u) => u.status === "ACTIVE" && u.role !== "SUPER_ADMIN"
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-brand-600 hover:underline">
            Dashboard
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">Candidates</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Candidates</h1>
        <p className="mt-1 text-sm text-slate-500">
          {CANDIDATE_FILTER_LABELS[filter]} across your job workspaces.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Candidate filter"
      >
        {CANDIDATE_LIST_FILTERS.map((value: CandidateListFilter) => {
          const active = filter === value;
          return (
            <Link
              key={value}
              href={candidateRoutes.list(value)}
              role="tab"
              aria-selected={active}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              )}
            >
              {CANDIDATE_FILTER_LABELS[value]}
            </Link>
          );
        })}
      </div>

      <Suspense fallback={null}>
        <CandidateListFilters
          statuses={statuses}
          recruiters={recruiters}
          jobs={workspaces.map((w) => ({ id: w.id, job_title: w.job_title }))}
          currentUserId={user.id}
        />
      </Suspense>

      <CandidateList
        items={items}
        statuses={statuses}
        canViewContact={canViewCandidateContact(user.role)}
      />
    </div>
  );
}
