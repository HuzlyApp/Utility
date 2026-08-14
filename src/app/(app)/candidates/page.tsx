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
import { JobSearchInput } from "@/components/dashboard/job-search-input";
import {
  CANDIDATE_FILTER_LABELS,
  CANDIDATE_LIST_FILTERS,
  candidateFilterToSql,
  parseCandidateFilterParam,
  type CandidateListFilter,
} from "@/lib/routes";
import {
  parseHasMatchedJobParam,
  parseStatusIdsParam,
} from "@/lib/candidate-list-table";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import { normalizeSearchQuery } from "@/lib/candidate-crm";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function buildTabHref(
  value: CandidateListFilter,
  current: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(current)) {
    if (!raw || key === "filter") continue;
    params.set(key, raw);
  }
  if (value !== "all") params.set("filter", value);
  const qs = params.toString();
  return qs ? `/candidates?${qs}` : "/candidates";
}

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: {
    filter?: string;
    search?: string;
    status?: string;
    assigned?: string;
    createdBy?: string;
    job?: string;
    matchedJob?: string;
    mine?: string;
    sort?: string;
    dir?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.tenantId) redirect("/dashboard");

  const filter = parseCandidateFilterParam(searchParams.filter);
  const sqlFilter = candidateFilterToSql(filter);
  const search = normalizeSearchQuery(searchParams.search);
  const canViewContact = canViewCandidateContact(user.role);
  const statusIds = parseStatusIdsParam(searchParams.status);
  const hasMatchedJob = parseHasMatchedJobParam(searchParams.matchedJob);

  const assigned =
    searchParams.assigned === "unassigned"
      ? null
      : searchParams.assigned || undefined;

  const [items, statuses, users, workspaces] = await Promise.all([
    listDashboardCandidates(user, {
      ...sqlFilter,
      statusIds,
      hasMatchedJob,
      assignedRecruiterId: searchParams.mine === "1" ? undefined : assigned,
      mine: searchParams.mine === "1",
      createdByUserId: searchParams.createdBy || undefined,
      workspaceId: searchParams.job || undefined,
      search: search || undefined,
      searchContact: canViewContact,
    }),
    listCandidateStatuses(user),
    listTenantUsers(user.tenantId),
    listWorkspaces(user),
  ]);

  const recruiters = users.filter(
    (u) => u.status === "ACTIVE" && u.role !== "SUPER_ADMIN"
  );

  const resultLabel = search
    ? `${items.length} candidate${items.length === 1 ? "" : "s"} found`
    : `${items.length} candidate${items.length === 1 ? "" : "s"}`;

  const tabParams = {
    search: search || undefined,
    status: searchParams.status,
    assigned: searchParams.assigned,
    createdBy: searchParams.createdBy,
    job: searchParams.job,
    matchedJob: searchParams.matchedJob,
    mine: searchParams.mine,
    sort: searchParams.sort,
    dir: searchParams.dir,
  };

  const clearSearchHref = (() => {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(tabParams)) {
      if (!raw || key === "search") continue;
      params.set(key, raw);
    }
    if (filter !== "all") params.set("filter", filter);
    const qs = params.toString();
    return qs ? `/candidates?${qs}` : "/candidates";
  })();

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Link href="/dashboard" className="text-brand-600 hover:underline">
            Dashboard
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">Candidates</span>
        </div>
        <h1 className="mt-1 text-[26px] font-bold leading-tight text-slate-900 sm:text-[28px]">
          Candidates
        </h1>
        <p className="mt-0.5 text-sm leading-snug text-slate-500">
          {CANDIDATE_FILTER_LABELS[filter]} across your job workspaces.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Candidate filter"
      >
        {CANDIDATE_LIST_FILTERS.map((value: CandidateListFilter) => {
          const active = filter === value;
          return (
            <Link
              key={value}
              href={buildTabHref(value, tabParams)}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-[36px] items-center rounded-lg px-3.5 text-[13px] font-medium transition-colors sm:h-[38px] sm:text-sm",
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Suspense fallback={null}>
          <JobSearchInput
            initialQuery={search}
            paramName="search"
            resetPageParam={null}
            placeholder="Search candidates by name, email, phone, job code, or job"
            label="Search candidates by name, email, phone, job code, or job"
            className="w-full sm:max-w-[480px]"
            inputClassName="h-10 text-[13px] sm:text-sm"
          />
        </Suspense>
        <p className="shrink-0 text-xs text-slate-500 sm:text-[13px]" aria-live="polite">
          {resultLabel}
        </p>
      </div>

      <Suspense fallback={null}>
        <CandidateListFilters
          statuses={statuses}
          recruiters={recruiters}
          jobs={workspaces.map((w) => ({ id: w.id, job_title: w.job_title }))}
          currentUserId={user.id}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CandidateList
          items={items}
          statuses={statuses}
          canViewContact={canViewContact}
          searchActive={Boolean(search)}
          searchQuery={search}
          clearSearchHref={clearSearchHref}
        />
      </Suspense>
    </div>
  );
}
