"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import {
  displayOrDash,
  toStatusHistory,
  type StatusHistoryEntry,
} from "@/lib/candidate-crm";
import type { CandidateActivityRow } from "@/lib/dal/types";

export function CandidateStatusHistory({
  activity,
}: {
  activity: CandidateActivityRow[];
}) {
  const history: StatusHistoryEntry[] = toStatusHistory(activity);

  return (
    <Card>
      <CardHeader
        title="Status history"
        description="Read-only record of status changes for this candidate."
      />
      <CardBody>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No status changes recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
              >
                <p className="text-sm font-medium text-slate-800">
                  {displayOrDash(entry.previousStatus)} →{" "}
                  {displayOrDash(entry.newStatus)}
                </p>
                {entry.note ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {entry.note}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-slate-500">
                  Updated by {displayOrDash(entry.updatedBy)} ·{" "}
                  {formatTimestamp(entry.changedAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
