import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getDashboardStats,
  listWorkspaces,
  getRecentAnalyses,
} from "@/lib/dal/workspaces";
import { getDashboardStatusTileCounts } from "@/lib/dal/statuses";
import { Card, CardBody } from "@/components/ui/primitives";
import { DashboardJobWorkspaces } from "@/components/dashboard/dashboard-job-workspaces";
import { RecentAnalyses } from "@/components/dashboard/recent-analyses";
import { redirect } from "next/navigation";
import { candidateRoutes, dashboardStatRoutes } from "@/lib/routes";
import { normalizeSearchQuery } from "@/lib/candidate-crm";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`View ${label}`}
      className={cn(
        "group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      )}
    >
      <Card
        className={cn(
          "h-full cursor-pointer transition-all duration-150",
          "group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md",
          "group-focus-visible:border-brand-300"
        )}
      >
        <CardBody className="py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
        </CardBody>
      </Card>
    </Link>
  );
}

function StatusTile({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string | null;
}) {
  const card = (
    <Card
      className={cn(
        "h-full transition-all duration-150",
        href
          ? "cursor-pointer group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md group-focus-visible:border-brand-300"
          : "opacity-90"
      )}
    >
      <CardBody className="flex h-full min-h-[88px] flex-col justify-between gap-2 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
      </CardBody>
    </Card>
  );

  if (!href) {
    return (
      <div className="min-w-0" aria-label={`${label}: ${value}`}>
        {card}
      </div>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`View ${label} candidates`}
      className={cn(
        "group block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      )}
    >
      {card}
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const search = normalizeSearchQuery(searchParams.q);

  const [stats, statusTiles, workspaces, recent] = await Promise.all([
    getDashboardStats(user),
    getDashboardStatusTileCounts(user),
    listWorkspaces(user, {
      includeArchived: true,
      search: search || undefined,
    }),
    getRecentAnalyses(user),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage job workspaces, add candidates, and compare match assessments.
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + Create Job Workspace
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Active Jobs"
          value={stats.active_jobs}
          tone="text-slate-900"
          href={dashboardStatRoutes.activeJobs}
        />
        <StatCard
          label="Total Candidates"
          value={stats.total_candidates}
          tone="text-slate-900"
          href={dashboardStatRoutes.totalCandidates}
        />
        <StatCard
          label="Strong Matches"
          value={stats.strong_matches}
          tone="text-green-600"
          href={dashboardStatRoutes.strongMatches}
        />
        <StatCard
          label="Needs Verification"
          value={stats.needs_verification}
          tone="text-amber-600"
          href={dashboardStatRoutes.needsVerification}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Candidate Status</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statusTiles.map((tile) => (
            <StatusTile
              key={tile.key}
              label={tile.label}
              value={tile.count}
              href={
                tile.statusId ? candidateRoutes.byStatus(tile.statusId) : null
              }
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <DashboardJobWorkspaces workspaces={workspaces} searchQuery={search} />
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Analyses</h2>
          <RecentAnalyses items={recent} />
        </section>
      </div>
    </div>
  );
}
