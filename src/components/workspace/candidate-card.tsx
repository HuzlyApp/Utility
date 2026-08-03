"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui/primitives";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { RankedCandidateRow } from "@/lib/dal/types";
import {
  CandidateStatusSelect,
  type StatusOption,
} from "@/components/candidate/candidate-status-select";
import { ModelBadge } from "@/components/workspace/ai-model-selector";

/**
 * Presentational candidate card used on narrow screens (mobile + tablet
 * portrait) in place of the dense ranking table. Wired up by RankingTable,
 * which passes the same callbacks the desktop table uses so analysis,
 * compare-selection, notes, stage updates, and open-candidate behaviour are
 * identical between layouts.
 */

const READINESS_LABEL: Record<string, string> = {
  READY_TO_SUBMIT: "Ready to submit",
  VERIFY_BEFORE_SUBMISSION: "Verify first",
  NOT_CURRENTLY_SUBMITTABLE: "Not submittable",
  INSUFFICIENT_INFORMATION: "More info needed",
};

const ACTION_LABEL: Record<string, string> = {
  PRIORITIZE_AND_CALL: "Prioritize & call",
  CALL_AND_VERIFY: "Call & verify",
  KEEP_AS_POSSIBLE: "Keep as possible",
  REDIRECT_TO_OTHER_JOB: "Redirect",
  STOP_FOR_THIS_JOB: "Verify before decision",
};

function scoreTone(
  score: number | null
): "green" | "emerald" | "amber" | "slate" {
  if (score == null) return "slate";
  if (score >= 90) return "green";
  if (score >= 75) return "emerald";
  if (score >= 60) return "amber";
  return "slate";
}

function statusTone(
  status: string
): "green" | "amber" | "blue" | "red" | "slate" {
  if (status === "ANALYZED") return "green";
  if (status === "READY") return "blue";
  if (status === "ANALYZING") return "blue";
  if (
    status === "UPDATE_PENDING" ||
    status === "EXTRACTING_UPDATED_RESUME" ||
    status === "REANALYZING" ||
    status === "VALIDATING" ||
    status === "SAVING"
  ) {
    return "blue";
  }
  if (status === "UPDATE_FAILED") return "red";
  if (status === "NEEDS_REVIEW") return "amber";
  if (status === "FAILED") return "red";
  return "slate";
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="break-words text-sm text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}

export interface CandidateProgressInfo {
  stage: string;
  percent: number;
  label: string;
}

export function CandidateCard({
  row,
  index,
  workspaceId,
  statuses,
  selected,
  progress,
  busy,
  batchRunning,
  onToggleSelect,
  onAnalyze,
  onOpenNotes,
  onStatusChanged,
}: {
  row: RankedCandidateRow;
  index: number;
  workspaceId: string;
  statuses: StatusOption[];
  selected: boolean;
  progress?: CandidateProgressInfo;
  busy: boolean;
  batchRunning: boolean;
  onToggleSelect: (candidateId: string, hasAnalysis: boolean) => void;
  onAnalyze: (candidateId: string) => void;
  onOpenNotes: (candidateId: string, name: string) => void;
  onStatusChanged: () => void;
}) {
  const candidateHref = `/candidates/${row.candidate_id}?w=${workspaceId}`;
  const name = row.full_name || "Unnamed candidate";
  const canCompare = Boolean(row.latest_analysis_id);
  const showProgress = progress && progress.stage !== "completed";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header: checkbox, name, score, model */}
      <div className="flex items-start gap-3">
        {canCompare && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.candidate_id, canCompare)}
            aria-label={`Select ${name} to compare`}
            className="mt-1 h-4 w-4 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={candidateHref}
              className="break-words text-[15px] font-semibold text-slate-900 hover:text-brand-700"
            >
              {name}
            </Link>
            <span className="text-xs text-slate-400">#{index + 1}</span>
          </div>
          {row.disposition && (
            <span className="mt-0.5 inline-block text-[10px] uppercase tracking-wide text-slate-400">
              {row.disposition.replace(/_/g, " ")}
            </span>
          )}
          {showProgress && (
            <p className="mt-1 break-words text-xs font-medium text-blue-700">
              {progress!.label}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {row.match_score != null ? (
            <Badge tone={scoreTone(row.match_score)}>{row.match_score}%</Badge>
          ) : (
            <span className="text-sm text-slate-300">—</span>
          )}
          <ModelBadge provider={row.ai_provider} model={row.ai_model} />
        </div>
      </div>

      {/* Match information */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        <Metric label="Category" value={
          row.match_category
            ? DISPLAY_CATEGORY[row.match_category as MatchCategory] ??
              row.match_category
            : null
        } />
        <Metric
          label="Confidence"
          value={row.confidence_score != null ? `${row.confidence_score}%` : null}
        />
        <Metric label="Confirmed" value={row.mandatory_confirmed} />
        <Metric label="Verify" value={row.mandatory_verify} />
        <Metric label="Not met" value={row.mandatory_not_met} />
        <Metric
          label="Readiness"
          value={
            row.submission_readiness
              ? READINESS_LABEL[row.submission_readiness] ??
                row.submission_readiness.replace(/_/g, " ")
              : null
          }
        />
        <Metric
          label="Recommendation"
          value={
            row.recommended_action
              ? ACTION_LABEL[row.recommended_action] ?? row.recommended_action
              : null
          }
        />
      </dl>

      {/* Status section */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Stage
        </p>
        <CandidateStatusSelect
          candidateId={row.candidate_id}
          statuses={statuses}
          value={row.current_status_id}
          statusName={row.status_name}
          statusColor={row.status_color}
          updatedByName={row.last_status_changed_by_name}
          updatedAt={row.last_status_changed_at}
          showAttribution={Boolean(row.last_status_changed_by_name)}
          fullWidth
          onChanged={onStatusChanged}
        />
      </div>

      {/* Pipeline */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Pipeline
        </span>
        <Badge tone={statusTone(row.status)}>
          {row.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Actions */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          className="h-11 w-full"
          onClick={() => onAnalyze(row.candidate_id)}
          disabled={busy || batchRunning}
        >
          {busy
            ? progress
              ? `${progress.percent}%`
              : "…"
            : row.status === "FAILED"
              ? "Retry"
              : row.latest_analysis_id
                ? "Reanalyze"
                : "Analyze"}
        </Button>
        <Button
          variant="secondary"
          className="h-11 w-full"
          onClick={() => onOpenNotes(row.candidate_id, name)}
        >
          Notes
          {row.notes_count > 0 ? (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-semibold text-slate-700">
              {row.notes_count}
            </span>
          ) : null}
        </Button>
        <Link
          href={candidateHref}
          className="col-span-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          Open candidate
        </Link>
      </div>
    </li>
  );
}
