import Link from "next/link";
import { Card, CardBody } from "@/components/ui/primitives";
import { candidateRoutes } from "@/lib/routes";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { DashboardCandidateRow } from "@/lib/dal/candidates";

function scoreTone(score: number | null): string {
  if (score == null) return "text-slate-400";
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-slate-600";
}

export function CandidateList({ items }: { items: DashboardCandidateRow[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-slate-500">
          No candidates match this filter.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="divide-y divide-slate-100 p-0">
        {items.map((row) => (
          <Link
            key={`${row.candidate_id}-${row.workspace_id ?? "none"}`}
            href={candidateRoutes.detail(row.candidate_id, row.workspace_id)}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                {row.full_name || "Unnamed candidate"}
              </p>
              <p className="truncate text-xs text-slate-400">
                {[row.job_title, row.specialty, row.location]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm font-bold ${scoreTone(row.match_score)}`}>
                {row.match_score != null ? `${row.match_score}%` : "—"}
              </p>
              <p className="text-[11px] text-slate-400">
                {row.match_category
                  ? DISPLAY_CATEGORY[row.match_category as MatchCategory] ??
                    row.match_category
                  : row.submission_readiness?.replace(/_/g, " ") ?? ""}
              </p>
            </div>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
