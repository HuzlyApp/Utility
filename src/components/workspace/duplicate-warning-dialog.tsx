"use client";

import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import type { DuplicateConfidence } from "@/lib/duplicate-candidate/types";
import type { DuplicateMatchSummary } from "@/lib/duplicate-candidate/messages";
import { duplicateWarningMessage } from "@/lib/duplicate-candidate/messages";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function DuplicateWarningDialog({
  candidateName,
  confidence,
  matches,
  workspaceId,
  onContinue,
  onCancel,
}: {
  candidateName: string;
  confidence: DuplicateConfidence;
  matches: DuplicateMatchSummary[];
  workspaceId: string;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const message = duplicateWarningMessage(candidateName, confidence);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        className="dialog-scroll max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-warning-title"
      >
        <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
          <h3
            id="duplicate-warning-title"
            className="text-base font-semibold text-slate-900"
          >
            Possible duplicate candidate
          </h3>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="whitespace-pre-line text-sm text-slate-700">{message}</p>

          {matches.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Existing matches
              </div>
              <ul className="divide-y divide-slate-100">
                {matches.map((m) => (
                  <li key={m.candidate_id} className="px-3 py-2.5 text-sm">
                    <div className="font-medium text-slate-900">{candidateName}</div>
                    <div className="mt-0.5 text-slate-600">
                      {m.job_title ?? "Unknown job"} · {formatDate(m.created_at)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {m.match_category ? `Match: ${m.match_category}` : "No analysis yet"}
                      {m.disposition ? ` · Disposition: ${m.disposition}` : ""}
                    </div>
                    <Link
                      href={`/candidates/${m.candidate_id}?w=${workspaceId}`}
                      className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Review existing candidate
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          {matches.length === 1 ? (
            <Link
              href={`/candidates/${matches[0].candidate_id}?w=${workspaceId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="sm" type="button">
                Review Existing Candidate
              </Button>
            </Link>
          ) : matches.length > 1 ? (
            <span className="text-xs text-slate-500">
              Use the links above to review matches.
            </span>
          ) : null}
          <Button size="sm" onClick={onContinue}>
            Continue Anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
