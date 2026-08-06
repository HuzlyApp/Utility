"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import {
  extractStatusChangeNote,
  formatActivitySummary,
} from "@/lib/candidate-crm";
import type { CandidateActivityRow } from "@/lib/dal/types";
import { CandidateStatusHistory } from "@/components/candidate/candidate-status-history";

export function CandidateActivityPanel({
  activity,
}: {
  activity: CandidateActivityRow[];
}) {
  return (
    <div className="space-y-4">
      <CandidateStatusHistory activity={activity} />
      <Card>
        <CardHeader
          title="Activity history"
          description="Read-only timeline of recruiter actions."
        />
        <CardBody>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-400">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {activity.map((item) => {
                const statusNote =
                  item.action_type === "STATUS_CHANGED"
                    ? extractStatusChangeNote(item.metadata)
                    : null;
                return (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
                    <p className="text-sm font-medium text-slate-800">
                      {formatActivitySummary({
                        actionType: item.action_type,
                        previousValue: item.previous_value,
                        newValue: item.new_value,
                      })}
                    </p>
                    {statusNote ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                        Note: {statusNote}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-slate-500">
                      Completed by{" "}
                      <span className="font-medium text-slate-700">
                        {item.performer_name || "System"}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatTimestamp(item.created_at)}
                    </p>
                    {item.metadata &&
                      typeof item.metadata === "object" &&
                      "ai_model" in item.metadata &&
                      item.metadata.ai_model != null && (
                        <p className="text-[11px] text-slate-400">
                          AI model: {String(item.metadata.ai_model)}
                          {item.metadata.ai_provider
                            ? ` (${String(item.metadata.ai_provider)})`
                            : ""}
                        </p>
                      )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
