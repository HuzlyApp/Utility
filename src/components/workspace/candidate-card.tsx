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
import { CandidateIdentityCell } from "@/components/workspace/candidate-identity-cell";
import { displayCandidateName } from "@/lib/resume-name";

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
  retryingContact = false,
  onToggleSelect,
  onAnalyze,
  onOpenNotes,
  onStatusChanged,
  onRetryContactExtraction,
}: {
  row: RankedCandidateRow;
  index: number;
  workspaceId: string;
  statuses: StatusOption[];
  selected: boolean;
  progress?: CandidateProgressInfo;
  busy: boolean;
  batchRunning: boolean;
  retryingContact?: boolean;
  onToggleSelect: (candidateId: string, hasAnalysis: boolean) => void;
  onAnalyze: (candidateId: string) => void;
  onOpenNotes: (candidateId: string, name: string) => void;
  onStatusChanged: () => void;
  onRetryContactExtraction?: (candidateId: string) => void;
}) {
  const candidateHref = `/candidates/${row.candidate_id}?w=${workspaceId}`;
  const name = displayCandidateName(row.full_name);
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
          <div className="flex flex-wrap items-start gap-2">
            <CandidateIdentityCell
              name={row.candidate_name ?? row.full_name}
              href={candidateHref}
              jobCode={row.job_code}
              phone={row.phone_number}
              email={row.email}
              canViewContact={row.can_view_contact}
              contactExtractionStatus={row.contact_extraction_status}
              contactExtractionStartedAt={row.contact_extraction_started_at}
              contactExtractionAttempts={row.contact_extraction_attempts}
              canRetryExtraction={row.can_view_contact}
              retrying={retryingContact}
              onRetryExtraction={
                onRetryContactExtraction
                  ? () => onRetryContactExtraction(row.candidate_id)
                  : undefined
              }
              disposition={row.disposition}
              progressLabel={showProgress ? progress!.label : null}
              className="min-w-0 max-w-none flex-1"
              nameClassName="text-[15px]"
            />
            <span className="shrink-0 text-xs text-slate-400">#{index + 1}</span>
          </div>
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
          candidateName={row.candidate_name ?? row.full_name}
          statuses={statuses}
          value={row.current_status_id}
          statusName={row.status_name}
          statusColor={row.status_color}
          updatedByName={row.last_status_changed_by_name}
          updatedAt={row.last_status_changed_at}
          showAttribution={Boolean(row.last_status_changed_by_name)}
          showHistoryAction
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
