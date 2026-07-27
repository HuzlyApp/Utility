import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listDashboardCandidates } from "@/lib/dal/candidates";
import { CandidateList } from "@/components/dashboard/candidate-list";
import {
  CANDIDATE_FILTER_LABELS,
  CANDIDATE_LIST_FILTERS,
  candidateFilterToSql,
  candidateRoutes,
  parseCandidateFilterParam,
  type CandidateListFilter,
} from "@/lib/routes";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const filter = parseCandidateFilterParam(searchParams.filter);
  const sqlFilter = candidateFilterToSql(filter);
  const items = await listDashboardCandidates(user, sqlFilter);

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

      <CandidateList items={items} />
    </div>
  );
}
