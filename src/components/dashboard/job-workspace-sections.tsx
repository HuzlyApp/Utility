"use client";

import Link from "next/link";
import { JobTiles } from "@/components/dashboard/job-tiles";
import { jobRoutes } from "@/lib/routes";
import type { WorkspaceSummary } from "@/lib/dal/types";

function SectionHeading({
  title,
  count,
  href,
  linkLabel,
}: {
  title: string;
  count: number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {count}
        </span>
      </h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ArchivedJobsSection({
  workspaces,
  searchQuery = "",
  clearSearchHref,
  viewAllHref,
  viewAllLabel = "View all",
}: {
  workspaces: WorkspaceSummary[];
  searchQuery?: string;
  clearSearchHref?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  const searching = Boolean(searchQuery);

  return (
    <section>
      <SectionHeading
        title="Archived Jobs"
        count={workspaces.length}
        href={viewAllHref}
        linkLabel={viewAllHref ? viewAllLabel : undefined}
      />
      <JobTiles
        workspaces={workspaces}
        emptyMessage={
          searching ? "No archived jobs match your search." : "No archived jobs."
        }
        emptyAction={
          searching && clearSearchHref
            ? { label: "Clear search", href: clearSearchHref }
            : undefined
        }
      />
    </section>
  );
}

export function JobWorkspaceSections({
  active,
  archived,
  searchQuery = "",
  showActive = true,
  showArchived = true,
  clearSearchHref,
}: {
  active: WorkspaceSummary[];
  archived: WorkspaceSummary[];
  searchQuery?: string;
  showActive?: boolean;
  showArchived?: boolean;
  clearSearchHref?: string;
}) {
  const searching = Boolean(searchQuery);
  const clearHref = clearSearchHref ?? jobRoutes.list();
  const searchEmptyAction = searching
    ? { label: "Clear search", href: clearHref }
    : undefined;

  return (
    <div className="space-y-8">
      {showActive ? (
        <section>
          <SectionHeading title="Active Jobs" count={active.length} />
          <JobTiles
            workspaces={active}
            emptyMessage={
              searching ? "No job workspaces match your search." : undefined
            }
            emptyAction={searching ? searchEmptyAction : undefined}
          />
        </section>
      ) : null}

      {showArchived ? (
        <ArchivedJobsSection
          workspaces={archived}
          searchQuery={searchQuery}
          clearSearchHref={clearHref}
        />
      ) : null}
    </div>
  );
}
