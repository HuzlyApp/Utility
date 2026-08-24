"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { JobSearchInput } from "@/components/dashboard/job-search-input";
import { JobSortSelect } from "@/components/dashboard/job-sort-select";
import { JobTiles } from "@/components/dashboard/job-tiles";
import { ArchivedJobsSection } from "@/components/dashboard/job-workspace-sections";
import { jobRoutes } from "@/lib/routes";
import {
  splitWorkspaces,
  type JobSortDir,
  type JobSortKey,
} from "@/lib/workspace-lists";
import type { WorkspaceSummary } from "@/lib/dal/types";
import { cn } from "@/lib/cn";

function dashboardJobsHref(opts: {
  q?: string;
  sort?: JobSortKey;
  dir?: JobSortDir;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.sort && opts.sort !== "updated") params.set("sort", opts.sort);
  if (opts.dir && opts.dir !== "desc") params.set("dir", opts.dir);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

export function DashboardJobWorkspaces({
  workspaces,
  searchQuery,
  dateField = "updated_at",
  sort = "updated",
  dir = "desc",
}: {
  workspaces: WorkspaceSummary[];
  searchQuery: string;
  dateField?: "updated_at" | "created_at";
  sort?: JobSortKey;
  dir?: JobSortDir;
}) {
  const [searchPending, setSearchPending] = useState(false);
  const { active, archived } = splitWorkspaces(workspaces);
  const viewAllHref = jobRoutes.list({
    status: "active",
    sort,
    dir,
  });

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Job Workspaces</h2>
          <Link
            href={viewAllHref}
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
          <Suspense
            fallback={
              <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100 sm:w-56" />
            }
          >
            <JobSortSelect className="w-full sm:w-56" />
          </Suspense>
          <Link
            href={viewAllHref}
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

        <div className="space-y-8">
          <JobTiles
            workspaces={active}
            dateField={dateField}
            emptyMessage={
              searchQuery ? "No job workspaces match your search." : undefined
            }
            emptyAction={
              searchQuery
                ? {
                    label: "Clear search",
                    href: dashboardJobsHref({ sort, dir }),
                  }
                : undefined
            }
          />
          <ArchivedJobsSection
            workspaces={archived}
            searchQuery={searchQuery}
            clearSearchHref={dashboardJobsHref({ sort, dir })}
            dateField={dateField}
            viewAllHref={jobRoutes.list({
              status: "archived",
              q: searchQuery || undefined,
              sort,
              dir,
            })}
            viewAllLabel="View archived"
          />
        </div>
      </div>
    </section>
  );
}
