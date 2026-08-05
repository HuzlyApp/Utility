"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/primitives";
import { candidateRoutes } from "@/lib/routes";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { DashboardCandidateRow } from "@/lib/dal/candidates";
import type { StatusOption } from "@/components/candidate/candidate-status-select";
import { CandidateStatusSelect } from "@/components/candidate/candidate-status-select";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import { displayCandidateName } from "@/lib/resume-name";

function scoreTone(score: number | null): string {
  if (score == null) return "text-slate-400";
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-slate-600";
}

export function CandidateList({
  items,
  statuses,
}: {
  items: DashboardCandidateRow[];
  statuses: StatusOption[];
}) {
  const router = useRouter();

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
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Candidate</th>
              <th className="px-3 py-2 font-medium">Matched job</th>
              <th className="px-3 py-2 font-medium">Match</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Assigned</th>
              <th className="px-3 py-2 font-medium">Last updated</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((row) => (
              <tr key={`${row.candidate_id}-${row.workspace_id ?? "none"}`} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link
                    href={candidateRoutes.detail(row.candidate_id, row.workspace_id)}
                    className="font-medium text-slate-800 hover:text-brand-700"
                  >
                    {displayCandidateName(row.full_name)}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {[row.specialty, row.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                </td>
                <td className="px-3 py-2 text-slate-600">{row.job_title || "—"}</td>
                <td className="px-3 py-2">
                  <p className={`font-semibold ${scoreTone(row.match_score)}`}>
                    {row.match_score != null ? `${row.match_score}%` : "—"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {row.match_category
                      ? DISPLAY_CATEGORY[row.match_category as MatchCategory] ??
                        row.match_category
                      : ""}
                  </p>
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <CandidateStatusSelect
                    candidateId={row.candidate_id}
                    statuses={statuses}
                    value={row.current_status_id}
                    statusName={row.status_name}
                    statusColor={row.status_color}
                    showAttribution={false}
                    onChanged={() => router.refresh()}
                  />
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {row.assigned_recruiter_name || "Unassigned"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  <p>{row.updated_by_name || "—"}</p>
                  <p>{formatTimestamp(row.updated_at)}</p>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {row.notes_count > 0 ? (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-medium">
                      {row.notes_count}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={candidateRoutes.detail(row.candidate_id, row.workspace_id)}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
           </tbody>
         </table>
        </div>
      </CardBody>
    </Card>
  );
}
