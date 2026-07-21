import Link from "next/link";
import { Card, CardBody } from "@/components/ui/primitives";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { RecentAnalysis } from "@/lib/dal/workspaces";

function scoreTone(score: number | null): string {
  if (score == null) return "text-slate-400";
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-slate-600";
}

export function RecentAnalyses({ items }: { items: RecentAnalysis[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardBody className="py-8 text-center text-sm text-slate-500">
          No analyses yet. Analyze candidates in a workspace to see them here.
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardBody className="divide-y divide-slate-100 p-0">
        {items.map((a) => (
          <Link
            key={a.analysis_id}
            href={
              a.candidate_id
                ? `/candidates/${a.candidate_id}${a.workspace_id ? `?w=${a.workspace_id}` : ""}`
                : "#"
            }
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                {a.candidate_name || "Unnamed candidate"}
              </p>
              <p className="truncate text-xs text-slate-400">{a.job_title || "—"}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${scoreTone(a.overall_match_score)}`}>
                {a.overall_match_score ?? "—"}%
              </p>
              <p className="text-[11px] text-slate-400">
                {a.match_category
                  ? DISPLAY_CATEGORY[a.match_category as MatchCategory] ?? a.match_category
                  : ""}
              </p>
            </div>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
