import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/dal/workspaces";
import { JobSearchInput } from "@/components/dashboard/job-search-input";
import { JobWorkspaceSections } from "@/components/dashboard/job-workspace-sections";
import { parseJobStatusParam, jobRoutes } from "@/lib/routes";
import { normalizeSearchQuery } from "@/lib/candidate-crm";
import { splitWorkspaces } from "@/lib/workspace-lists";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { value: "active" as const, label: "Active" },
  { value: "archived" as const, label: "Archived" },
  { value: "all" as const, label: "All" },
];

export default async function JobsListPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const status = parseJobStatusParam(searchParams.status);
  const search = normalizeSearchQuery(searchParams.q);
  const workspaces = await listWorkspaces(user, {
    includeArchived: true,
    search: search || undefined,
  });
  const { active, archived } = splitWorkspaces(workspaces);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/dashboard" className="text-brand-600 hover:underline">
              Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-500">Jobs</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Job Workspaces</h1>
          <p className="mt-1 text-sm text-slate-500">
            Browse active and archived job workspaces.
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + Create Job Workspace
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Job status filter">
        {STATUS_TABS.map((tab) => {
          const selected = status === tab.value;
          const href = jobRoutes.list({ status: tab.value, q: search || undefined });
          return (
            <Link
              key={tab.value}
              href={href}
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                selected
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Suspense fallback={null}>
        <JobSearchInput initialQuery={search} />
      </Suspense>

      <JobWorkspaceSections
        active={active}
        archived={archived}
        searchQuery={search}
        showActive={status !== "archived"}
        showArchived
        clearSearchHref={jobRoutes.list({ status })}
      />
    </div>
  );
}
