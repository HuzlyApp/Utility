"use client";

import Link from "next/link";
import { JobTiles } from "@/components/dashboard/job-tiles";
import { jobRoutes, type JobListStatus } from "@/lib/routes";
import type { WorkspaceSummary } from "@/lib/dal/types";
import { JOB_LIST_STATUS_HEADINGS } from "@/lib/workspace-lists";

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
  dateField = "updated_at",
}: {
  workspaces: WorkspaceSummary[];
  searchQuery?: string;
  clearSearchHref?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  dateField?: "updated_at" | "created_at";
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
        dateField={dateField}
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

function emptyMessageForTab(
  listStatus: JobListStatus,
  searching: boolean
): string | undefined {
  if (searching) {
    if (listStatus === "archived") return "No archived jobs match your search.";
    if (listStatus === "active") return "No active jobs match your search.";
    return "No job workspaces match your search.";
  }
  if (listStatus === "archived") return "No archived jobs.";
  if (listStatus === "active") return "No active jobs.";
  return undefined;
}

/**
 * Tab-scoped job list: one heading/count matching Active / Archived / All.
 * Prefer this on /jobs so CLOSED never appears under Active.
 */
export function JobWorkspaceSections({
  workspaces,
  listStatus = "all",
  searchQuery = "",
  clearSearchHref,
  dateField = "updated_at",
  /** @deprecated Prefer `workspaces` + `listStatus`. Kept for dashboard split views. */
  active,
  archived,
  showActive = true,
  showArchived = true,
}: {
  workspaces?: WorkspaceSummary[];
  listStatus?: JobListStatus;
  searchQuery?: string;
  clearSearchHref?: string;
  dateField?: "updated_at" | "created_at";
  active?: WorkspaceSummary[];
  archived?: WorkspaceSummary[];
  showActive?: boolean;
  showArchived?: boolean;
}) {
  const searching = Boolean(searchQuery);
  const clearHref = clearSearchHref ?? jobRoutes.list({ status: listStatus });
  const searchEmptyAction = searching
    ? { label: "Clear search", href: clearHref }
    : undefined;

  // Canonical tab mode: single filtered list + matching heading.
  if (workspaces) {
    return (
      <section>
        <SectionHeading
          title={JOB_LIST_STATUS_HEADINGS[listStatus]}
          count={workspaces.length}
        />
        <JobTiles
          workspaces={workspaces}
          dateField={dateField}
          emptyMessage={emptyMessageForTab(listStatus, searching)}
          emptyAction={searching ? searchEmptyAction : undefined}
        />
      </section>
    );
  }

  // Legacy split mode (dashboard): Active tiles + optional Archived section.
  return (
    <div className="space-y-8">
      {showActive ? (
        <section>
          <SectionHeading title="Active Jobs" count={(active ?? []).length} />
          <JobTiles
            workspaces={active ?? []}
            dateField={dateField}
            emptyMessage={
              searching ? "No job workspaces match your search." : undefined
            }
            emptyAction={searching ? searchEmptyAction : undefined}
          />
        </section>
      ) : null}

      {showArchived ? (
        <ArchivedJobsSection
          workspaces={archived ?? []}
          searchQuery={searchQuery}
          clearSearchHref={clearHref}
          dateField={dateField}
        />
      ) : null}
    </div>
  );
}
