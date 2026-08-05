"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { RankedCandidateRow } from "@/lib/dal/types";
import {
  STAGE_LABEL,
  STAGE_PROGRESS,
  type AnalysisProgressEvent,
  type AnalysisProgressStage,
} from "@/lib/analysis-stages";
import {
  analyzeCandidateWithDuplicateCheck,
  DuplicateConfirmationNeededError,
  AnalyzeRequestError,
} from "@/lib/client/analyze-with-duplicate-check";
import type { DuplicateConfirmationRequired } from "@/lib/duplicate-candidate/messages";
import { onWorkspaceCandidatesChanged } from "@/lib/workspace-events";
import { CompareDialog } from "./compare-dialog";
import { DuplicateWarningDialog } from "./duplicate-warning-dialog";
import { CandidateCard } from "./candidate-card";
import {
  AiModelSelector,
  ModelBadge,
  type ProviderAvailability,
} from "./ai-model-selector";
import { useAiModelSelection } from "@/hooks/use-ai-model-selection";
import { AnalysisProgressBar, analysisPercent, stageFromEvent } from "./analysis-progress";
import {
  CandidateStatusSelect,
  type StatusOption,
} from "@/components/candidate/candidate-status-select";
import { CandidateNotesDialog } from "@/components/candidate/candidate-notes-dialog";
import type { CrmActorRole } from "@/lib/candidate-crm";
import { displayCandidateName } from "@/lib/resume-name";

type SortKey = "score" | "name" | "category" | "readiness" | "verification" | "date";

type CandidateProgress = {
  stage: AnalysisProgressStage;
  percent: number;
  label: string;
};

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

const POLL_MS = 2_500;
const STALE_ANALYZING_MS = 6 * 60_000;

function scoreTone(score: number | null): "green" | "emerald" | "amber" | "slate" {
  if (score == null) return "slate";
  if (score >= 90) return "green";
  if (score >= 75) return "emerald";
  if (score >= 60) return "amber";
  return "slate";
}

function statusTone(status: string): "green" | "amber" | "blue" | "red" | "slate" {
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

function applyCompletedResult(
  row: RankedCandidateRow,
  event: AnalysisProgressEvent
): RankedCandidateRow {
  return {
    ...row,
    status: "ANALYZED",
    latest_analysis_id: event.analysis_id ?? row.latest_analysis_id,
    match_score: event.overall_match_score ?? row.match_score,
    match_category: event.match_category ?? row.match_category,
    submission_readiness: event.submission_readiness ?? row.submission_readiness,
    recommended_action: event.recommended_action ?? row.recommended_action,
    ai_provider: event.ai_provider ?? row.ai_provider,
    ai_model: event.ai_model ?? row.ai_model,
    analyzed_at: new Date().toISOString(),
  };
}

export function RankingTable({
  workspaceId,
  initial,
  statuses = [],
  currentUserId,
  currentUserRole,
}: {
  workspaceId: string;
  initial: RankedCandidateRow[];
  statuses?: StatusOption[];
  currentUserId: string;
  currentUserRole: CrmActorRole;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<RankedCandidateRow[]>(initial);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [readyFilter, setReadyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [notesFor, setNotesFor] = useState<{
    candidateId: string;
    candidateName: string;
  } | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<
    (DuplicateConfirmationRequired & { candidateId: string }) | null
  >(null);
  const duplicateResolverRef = useRef<((continued: boolean) => void) | null>(null);
  const [progressById, setProgressById] = useState<Record<string, CandidateProgress>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const [, setInFlightTick] = useState(0);
  const analyzingSinceRef = useRef<Record<string, number>>({});
  const { optionId, setOptionId, option, requestBody } = useAiModelSelection();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);

  const inFlightCount = inFlightRef.current.size;
  const analyzing = batchRunning || inFlightCount > 0;

  const batchDone = useMemo(
    () => Object.values(progressById).filter((p) => p.stage === "completed").length,
    [progressById]
  );
  const batchTotal = useMemo(() => {
    if (batchRunning) return Math.max(Object.keys(progressById).length, inFlightCount, 1);
    return Math.max(inFlightCount, Object.keys(progressById).length);
  }, [batchRunning, progressById, inFlightCount]);

  const aggregatePercent = useMemo(() => {
    const active = Object.values(progressById).filter((p) => p.stage !== "failed");
    if (active.length === 0) return analyzing ? STAGE_PROGRESS.preparing : 0;
    if (active.every((p) => p.stage === "completed")) return 100;
    if (batchTotal > 1) {
      const done = active.filter((p) => p.stage === "completed").length;
      const running = active.filter((p) => p.stage !== "completed").length;
      return analysisPercent(done, Math.max(batchTotal, active.length), running);
    }
    return active[0]?.percent ?? STAGE_PROGRESS.analyzing;
  }, [progressById, analyzing, batchTotal]);

  const aggregateLabel = useMemo(() => {
    const active = Object.values(progressById).filter(
      (p) => p.stage !== "completed" && p.stage !== "failed"
    );
    if (active.length === 1) return active[0].label;
    if (active.length > 1) return `Analyzing ${active.length} candidates…`;
    if (analyzing) return option.loadingLabel;
    return STAGE_LABEL.preparing;
  }, [progressById, analyzing, option.loadingLabel]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/candidates`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(data.candidates as RankedCandidateRow[]);
      }
    } catch {
      /* ignore transient network errors; next poll/retry will recover */
    }
  }, [workspaceId]);

  // Keep local rows in sync when SSR props change after router.refresh().
  // Preserve in-flight optimistic rows so a concurrent upload refresh cannot
  // reset an active analysis back to READY/stale data.
  useEffect(() => {
    setRows((prev) => {
      const inFlight = inFlightRef.current;
      if (inFlight.size === 0) return initial;

      const prevById = new Map(prev.map((r) => [r.candidate_id, r]));
      return initial.map((server) => {
        if (!inFlight.has(server.candidate_id)) return server;
        if (server.status === "ANALYZED" || server.status === "FAILED") return server;
        const local = prevById.get(server.candidate_id);
        if (!local) return { ...server, status: "ANALYZING" };
        return { ...local, status: "ANALYZING" };
      });
    });
  }, [initial]);

  useEffect(() => {
    return onWorkspaceCandidatesChanged(workspaceId, () => {
      void refresh();
    });
  }, [workspaceId, refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/providers");
        const data = await res.json();
        if (!cancelled && res.ok && data.success) {
          setAvailability(data.availability as ProviderAvailability);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume polling for ANALYZING rows after navigation/refresh until DB settles.
  const hasAnalyzingRows = rows.some((r) => r.status === "ANALYZING");

  useEffect(() => {
    const now = Date.now();
    for (const row of rows) {
      if (row.status === "ANALYZING" && analyzingSinceRef.current[row.candidate_id] == null) {
        analyzingSinceRef.current[row.candidate_id] = now;
      }
    }
    for (const id of Object.keys(analyzingSinceRef.current)) {
      const row = rows.find((r) => r.candidate_id === id);
      if (!row || row.status !== "ANALYZING") delete analyzingSinceRef.current[id];
    }
  }, [rows]);

  useEffect(() => {
    if (!hasAnalyzingRows) return;

    let warnedStale = false;
    const pollId = window.setInterval(() => {
      void refresh();

      const staleIds = Object.entries(analyzingSinceRef.current)
        .filter(
          ([id, started]) =>
            !inFlightRef.current.has(id) && Date.now() - started > STALE_ANALYZING_MS
        )
        .map(([id]) => id);

      if (staleIds.length === 0 || warnedStale) return;
      warnedStale = true;
      setRows((prev) =>
        prev.map((r) =>
          staleIds.includes(r.candidate_id) && r.status === "ANALYZING"
            ? { ...r, status: "FAILED" }
            : r
        )
      );
      for (const id of staleIds) delete analyzingSinceRef.current[id];
      toast("An analysis timed out. Use Retry on the affected candidate.", "error");
    }, POLL_MS);

    return () => window.clearInterval(pollId);
  }, [hasAnalyzingRows, refresh, toast]);

  function setCandidateProgress(candidateId: string, event: AnalysisProgressEvent) {
    const mapped = stageFromEvent(event);
    setProgressById((prev) => ({
      ...prev,
      [candidateId]: {
        stage: mapped.stage,
        percent: mapped.percent,
        label: mapped.label,
      },
    }));
  }

  function markInFlight(candidateId: string, active: boolean) {
    if (active) inFlightRef.current.add(candidateId);
    else inFlightRef.current.delete(candidateId);
    setInFlightTick((n) => n + 1);
  }

  async function analyzeOne(
    candidateId: string,
    duplicateConfirmation?: { token: string }
  ): Promise<boolean> {
    const priorStatus =
      rows.find((r) => r.candidate_id === candidateId)?.status ?? "READY";

    markInFlight(candidateId, true);
    setCandidateProgress(candidateId, {
      stage: "preparing",
      progress: STAGE_PROGRESS.preparing,
      message: "Preparing candidate data…",
      candidate_id: candidateId,
    });
    setRows((prev) =>
      prev.map((r) => (r.candidate_id === candidateId ? { ...r, status: "ANALYZING" } : r))
    );

    try {
      const row = rows.find((r) => r.candidate_id === candidateId);
      const result = await analyzeCandidateWithDuplicateCheck({
        workspaceId,
        candidateId,
        body: {
          ...requestBody,
          ...(row?.status === "FAILED" || row?.status === "ANALYZING"
            ? { force_retry: true }
            : {}),
        },
        duplicateConfirmation,
        onProgress: (event) => {
          setCandidateProgress(candidateId, event);
          if (event.stage === "completed") {
            setRows((prev) =>
              prev.map((r) =>
                r.candidate_id === candidateId ? applyCompletedResult(r, event) : r
              )
            );
          }
        },
      });

      setCandidateProgress(candidateId, {
        ...result,
        stage: "completed",
        progress: 100,
        message: "Analysis completed",
      });
      setRows((prev) =>
        prev.map((r) =>
          r.candidate_id === candidateId ? applyCompletedResult(r, result) : r
        )
      );
      return true;
    } catch (err) {
      if (
        err instanceof DuplicateConfirmationNeededError &&
        !duplicateConfirmation
      ) {
        setRows((prev) =>
          prev.map((r) =>
            r.candidate_id === candidateId ? { ...r, status: priorStatus } : r
          )
        );
        setCandidateProgress(candidateId, {
          stage: "preparing",
          progress: 0,
          message: "Waiting for duplicate confirmation…",
          candidate_id: candidateId,
        });

        const continued = await new Promise<boolean>((resolve) => {
          duplicateResolverRef.current = resolve;
          setDuplicateDialog({
            ...err.duplicate,
            candidateId,
          });
        });

        duplicateResolverRef.current = null;
        setDuplicateDialog(null);

        if (!continued) {
          setProgressById((prev) => {
            const next = { ...prev };
            delete next[candidateId];
            return next;
          });
          return false;
        }

        return analyzeOne(candidateId, {
          token: err.duplicate.duplicate_confirmation_token,
        });
      }

      const message =
        err instanceof AnalyzeRequestError
          ? err.message
          : "Analysis failed.";
      setCandidateProgress(candidateId, {
        stage: "failed",
        progress: 0,
        message,
        error: message,
        candidate_id: candidateId,
      });
      setRows((prev) =>
        prev.map((r) => (r.candidate_id === candidateId ? { ...r, status: "FAILED" } : r))
      );
      toast(message, "error");
      return false;
    } finally {
      markInFlight(candidateId, false);
    }
  }

  function handleDuplicateContinue() {
    duplicateResolverRef.current?.(true);
  }

  function handleDuplicateCancel() {
    if (duplicateDialog) {
      markInFlight(duplicateDialog.candidateId, false);
      setProgressById((prev) => {
        const next = { ...prev };
        delete next[duplicateDialog.candidateId];
        return next;
      });
    }
    duplicateResolverRef.current?.(false);
  }

  async function analyzeSingle(candidateId: string) {
    if (inFlightRef.current.has(candidateId)) return;
    if (availability && !availability[option.provider]?.available) {
      toast(
        availability[option.provider]?.message ?? `${option.label} is unavailable.`,
        "error"
      );
      return;
    }

    const ok = await analyzeOne(candidateId);
    await refresh();
    router.refresh();
    setProgressById((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });
    if (ok) toast("Analysis completed", "success");
  }

  async function analyzeAllReady() {
    const selectedProvider = option.provider;
    if (availability && !availability[selectedProvider]?.available) {
      toast(
        availability[selectedProvider]?.message ?? `${option.label} is unavailable.`,
        "error"
      );
      return;
    }

    const ready = rows.filter(
      (r) =>
        (r.status === "READY" || r.status === "NEEDS_REVIEW" || r.status === "FAILED") &&
        !inFlightRef.current.has(r.candidate_id)
    );
    if (ready.length === 0) {
      toast("No candidates are ready to analyze.", "info");
      return;
    }

    setBatchRunning(true);
    setProgressById({});

    const concurrency = 2;
    let index = 0;
    let failures = 0;

    async function worker() {
      while (index < ready.length) {
        const current = ready[index++];
        const ok = await analyzeOne(current.candidate_id);
        if (!ok) failures += 1;
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, ready.length) }, () => worker())
    );
    setBatchRunning(false);
    await refresh();
    router.refresh();
    setProgressById({});
    if (failures === 0) toast("Batch analysis complete.", "success");
    else toast(`Batch finished with ${failures} failure(s).`, "info");
  }

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.match_category).filter(Boolean))) as string[],
    [rows]
  );

  const view = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        displayCandidateName(r.full_name).toLowerCase().includes(q)
      );
    }
    if (catFilter) list = list.filter((r) => r.match_category === catFilter);
    if (readyFilter) list = list.filter((r) => r.submission_readiness === readyFilter);
    if (statusFilter === "__none__") {
      list = list.filter((r) => !r.current_status_id);
    } else if (statusFilter) {
      list = list.filter((r) => r.current_status_id === statusFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (
            dir *
            displayCandidateName(a.full_name).localeCompare(
              displayCandidateName(b.full_name)
            )
          );
        case "category":
          return dir * (a.match_category ?? "").localeCompare(b.match_category ?? "");
        case "readiness":
          return (
            dir *
            (a.submission_readiness ?? "").localeCompare(b.submission_readiness ?? "")
          );
        case "verification":
          return dir * ((a.mandatory_verify ?? 0) - (b.mandatory_verify ?? 0));
        case "date":
          return (
            dir *
            ((a.analyzed_at ? Date.parse(a.analyzed_at) : 0) -
              (b.analyzed_at ? Date.parse(b.analyzed_at) : 0))
          );
        case "score":
        default:
          return dir * ((a.match_score ?? -1) - (b.match_score ?? -1));
      }
    });
    return list;
  }, [rows, search, catFilter, readyFilter, statusFilter, sortKey, sortDir]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const selectedEntries = view
    .filter((r) => selected[r.candidate_id] && r.latest_analysis_id)
    .map((r) => ({
      analysisId: r.latest_analysis_id as string,
      name: displayCandidateName(r.full_name),
    }));

  function toggleSelect(candidateId: string, hasAnalysis: boolean) {
    if (!hasAnalysis) return;
    setSelected((prev) => {
      const next = { ...prev, [candidateId]: !prev[candidateId] };
      const count = Object.values(next).filter(Boolean).length;
      if (count > 4) {
        toast("Select up to 4 candidates to compare.", "info");
        return prev;
      }
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No candidates yet. Add candidates above to build the ranking.
      </p>
    );
  }

  const showIndeterminate =
    analyzing &&
    aggregatePercent >= STAGE_PROGRESS.analyzing &&
    aggregatePercent < 100 &&
    Object.values(progressById).some((p) => p.stage === "analyzing");

  const filterControlClass =
    "h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm lg:h-8";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <AiModelSelector
          value={optionId}
          onChange={setOptionId}
          disabled={batchRunning}
          availability={availability}
        />
        <Button onClick={analyzeAllReady} disabled={batchRunning}>
          {batchRunning
            ? `${option.loadingLabel.replace(/…$/, "")} ${aggregatePercent}%`
            : "Analyze All Ready Candidates"}
        </Button>
        <span className="text-xs text-slate-500">
          Using <span className="font-medium text-slate-700">{option.label}</span>
        </span>
        {selectedIds.length >= 2 && selectedEntries.length >= 2 && (
          <Button variant="outline" onClick={() => setCompareOpen(true)}>
            Compare Selected ({selectedEntries.length})
          </Button>
        )}
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] lg:items-center">
        <input
          placeholder="Search by candidate name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search by candidate name"
          className={`${filterControlClass} sm:col-span-2 lg:col-span-1`}
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          aria-label="Filter by category"
          className={filterControlClass}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {DISPLAY_CATEGORY[c as MatchCategory] ?? c}
            </option>
          ))}
        </select>
        <select
          value={readyFilter}
          onChange={(e) => setReadyFilter(e.target.value)}
          aria-label="Filter by readiness"
          className={filterControlClass}
        >
          <option value="">All readiness</option>
          {Object.entries(READINESS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by stage"
          className={filterControlClass}
        >
          <option value="">All stages</option>
          <option value="__none__">No stage</option>
          {statuses
            .filter((s) => s.is_active !== false)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split(":");
            setSortKey(k as SortKey);
            setSortDir(d as "asc" | "desc");
          }}
          aria-label="Sort by score"
          className={`${filterControlClass} sm:col-span-2 lg:col-span-1`}
        >
          <option value="score:desc">Score (high→low)</option>
          <option value="score:asc">Score (low→high)</option>
          <option value="name:asc">Name (A→Z)</option>
          <option value="category:asc">Category</option>
          <option value="readiness:asc">Readiness</option>
          <option value="verification:desc">Verification needs</option>
          <option value="date:desc">Analysis date</option>
        </select>
      </div>

      {analyzing && (
        <AnalysisProgressBar
          percent={aggregatePercent}
          label={aggregateLabel}
          indeterminate={showIndeterminate}
          detail={
            batchTotal > 1 || batchRunning
              ? `${batchDone} of ${batchTotal} candidates completed · ${inFlightCount} processing`
              : Object.values(progressById)[0]?.label ?? option.loadingLabel
          }
        />
      )}

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Candidate</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Model</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2" title="Mandatory confirmed">
                Conf.
              </th>
              <th className="px-2 py-2" title="Needs verification">
                Verify
              </th>
              <th className="px-2 py-2" title="Clearly not met">
                Not met
              </th>
              <th className="px-2 py-2">Readiness</th>
              <th className="px-2 py-2">Recommended</th>
              <th className="px-2 py-2">Stage</th>
              <th className="px-2 py-2">Pipeline</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const rowProgress = progressById[r.candidate_id];
              const rowBusy =
                inFlightRef.current.has(r.candidate_id) || r.status === "ANALYZING";
              return (
                <tr key={r.candidate_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 text-slate-400">
                    <div className="flex items-center gap-1">
                      {r.latest_analysis_id && (
                        <input
                          type="checkbox"
                          checked={!!selected[r.candidate_id]}
                          onChange={() =>
                            toggleSelect(r.candidate_id, !!r.latest_analysis_id)
                          }
                          aria-label="Select to compare"
                        />
                      )}
                      {i + 1}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-800">
                    <div className="min-w-0">
                      <Link
                        href={`/candidates/${r.candidate_id}?w=${workspaceId}`}
                        className="break-words hover:text-brand-700"
                      >
                        {displayCandidateName(r.full_name)}
                      </Link>
                      {r.disposition && (
                        <span className="ml-2 text-[10px] uppercase text-slate-400">
                          {r.disposition.replace(/_/g, " ")}
                        </span>
                      )}
                      {rowProgress && rowProgress.stage !== "completed" && (
                        <p className="mt-0.5 break-words text-[11px] font-normal text-blue-700">
                          {rowProgress.label}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {r.match_score != null ? (
                      <Badge tone={scoreTone(r.match_score)}>{r.match_score}%</Badge>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {r.latest_analysis_id ? (
                      <ModelBadge provider={r.ai_provider} model={r.ai_model} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {r.match_category
                      ? DISPLAY_CATEGORY[r.match_category as MatchCategory] ??
                        r.match_category
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-green-700">
                    {r.mandatory_confirmed ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-amber-700">
                    {r.mandatory_verify ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-red-700">{r.mandatory_not_met ?? "—"}</td>
                  <td className="px-2 py-2 text-slate-600">
                    {r.submission_readiness
                      ? READINESS_LABEL[r.submission_readiness] ?? r.submission_readiness
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {r.recommended_action
                      ? ACTION_LABEL[r.recommended_action] ?? r.recommended_action
                      : "—"}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <CandidateStatusSelect
                      candidateId={r.candidate_id}
                      statuses={statuses}
                      value={r.current_status_id}
                      statusName={r.status_name}
                      statusColor={r.status_color}
                      updatedByName={r.last_status_changed_by_name}
                      updatedAt={r.last_status_changed_at}
                      showAttribution={Boolean(r.last_status_changed_by_name)}
                      onChanged={() => {
                        void refresh();
                        router.refresh();
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={statusTone(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => analyzeSingle(r.candidate_id)}
                        disabled={rowBusy || batchRunning}
                      >
                        {rowBusy
                          ? rowProgress
                            ? `${rowProgress.percent}%`
                            : "…"
                          : r.status === "FAILED"
                            ? "Retry"
                            : r.latest_analysis_id
                              ? "Reanalyze"
                              : "Analyze"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setNotesFor({
                            candidateId: r.candidate_id,
                            candidateName: displayCandidateName(r.full_name),
                          })
                        }
                      >
                        Notes
                        {r.notes_count > 0 ? (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-semibold text-slate-700">
                            {r.notes_count}
                          </span>
                        ) : null}
                      </Button>
                      <Link
                        href={`/candidates/${r.candidate_id}?w=${workspaceId}`}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
           </tbody>
         </table>
      </div>

      {/* Mobile / tablet-portrait candidate cards. Renders the same data and
          callbacks as the desktop table so analysis, compare-selection, notes,
          stage updates, and open-candidate behaviour are identical. */}
      <ul className="grid gap-3 lg:hidden">
        {view.map((r, i) => {
          const rowProgress = progressById[r.candidate_id];
          const rowBusy =
            inFlightRef.current.has(r.candidate_id) || r.status === "ANALYZING";
          return (
            <CandidateCard
              key={r.candidate_id}
              row={r}
              index={i}
              workspaceId={workspaceId}
              statuses={statuses}
              selected={!!selected[r.candidate_id]}
              progress={rowProgress}
              busy={rowBusy}
              batchRunning={batchRunning}
              onToggleSelect={toggleSelect}
              onAnalyze={(id) => void analyzeSingle(id)}
              onOpenNotes={(id, name) =>
                setNotesFor({ candidateId: id, candidateName: name })
              }
              onStatusChanged={() => {
                void refresh();
                router.refresh();
              }}
            />
          );
        })}
      </ul>

      {compareOpen && (
        <CompareDialog entries={selectedEntries} onClose={() => setCompareOpen(false)} />
      )}

      {notesFor && (
        <CandidateNotesDialog
          candidateId={notesFor.candidateId}
          candidateName={notesFor.candidateName}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setNotesFor(null)}
          onNotesChange={(count) => {
            setRows((prev) =>
              prev.map((row) =>
                row.candidate_id === notesFor.candidateId
                  ? { ...row, notes_count: count }
                  : row
              )
            );
          }}
        />
      )}

      {duplicateDialog && (
        <DuplicateWarningDialog
          candidateName={duplicateDialog.candidate_name}
          confidence={duplicateDialog.duplicate_confidence}
          matches={duplicateDialog.matches}
          workspaceId={workspaceId}
          onContinue={handleDuplicateContinue}
          onCancel={handleDuplicateCancel}
        />
      )}
    </div>
  );
}
