"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { JobSearchInput } from "@/components/dashboard/job-search-input";
import { JobTiles } from "@/components/dashboard/job-tiles";
import { dashboardStatRoutes } from "@/lib/routes";
import type { WorkspaceSummary } from "@/lib/dal/types";
import { cn } from "@/lib/cn";

export function DashboardJobWorkspaces({
  workspaces,
  searchQuery,
}: {
  workspaces: WorkspaceSummary[];
  searchQuery: string;
}) {
  const [searchPending, setSearchPending] = useState(false);

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Job Workspaces</h2>
          <Link
            href={dashboardStatRoutes.activeJobs}
            className="shrink-0 text-xs font-medium text-brand-600 hover:underline sm:hidden"
          >
            View all
          </Link>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <Suspense
            fallback={
              <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100 sm:w-72" />
            }
          >
            <JobSearchInput
              initialQuery={searchQuery}
              placeholder="Search jobs by title or job code"
              className="w-full sm:w-72"
              onPendingChange={setSearchPending}
            />
          </Suspense>
          <Link
            href={dashboardStatRoutes.activeJobs}
            className="hidden shrink-0 text-xs font-medium text-brand-600 hover:underline sm:inline"
          >
            View all
          </Link>
        </div>
      </div>

      <div className={cn("relative", searchPending && "pointer-events-none")}>
        {searchPending ? (
          <div
            className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/60 pt-10"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
                aria-hidden
              />
              Searching…
            </span>
          </div>
        ) : null}
        <JobTiles
          workspaces={workspaces}
          emptyMessage={
            searchQuery ? "No job workspaces match your search." : undefined
          }
          emptyAction={
            searchQuery
              ? {
                  label: "Clear search",
                  href: "/dashboard",
                }
              : undefined
          }
        />
      </div>
    </section>
  );
}
