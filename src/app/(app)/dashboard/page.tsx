import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getDashboardStats,
  listWorkspaces,
  getRecentAnalyses,
} from "@/lib/dal/workspaces";
import { Card, CardBody } from "@/components/ui/primitives";
import { JobTiles } from "@/components/dashboard/job-tiles";
import { RecentAnalyses } from "@/components/dashboard/recent-analyses";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
      </CardBody>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [stats, workspaces, recent] = await Promise.all([
    getDashboardStats(user),
    listWorkspaces(user),
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Active Jobs" value={stats.active_jobs} tone="text-slate-900" />
        <StatCard label="Total Candidates" value={stats.total_candidates} tone="text-slate-900" />
        <StatCard label="Strong Matches" value={stats.strong_matches} tone="text-green-600" />
        <StatCard label="Needs Verification" value={stats.needs_verification} tone="text-amber-600" />
        <StatCard label="Ready to Submit" value={stats.ready_to_submit} tone="text-emerald-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Job Workspaces</h2>
          <JobTiles workspaces={workspaces} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Analyses</h2>
          <RecentAnalyses items={recent} />
        </section>
      </div>
    </div>
  );
}
