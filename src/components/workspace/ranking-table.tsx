"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { RankedCandidateRow } from "@/lib/dal/types";
import { CompareDialog } from "./compare-dialog";
import {
  AiModelSelector,
  ModelBadge,
  type ProviderAvailability,
} from "./ai-model-selector";
import { useAiModelSelection } from "@/hooks/use-ai-model-selection";
import {
  AnalysisProgressBar,
  analysisPercent,
  useEstimatedAnalysisPercent,
} from "./analysis-progress";

type SortKey = "score" | "name" | "category" | "readiness" | "verification" | "date";

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
  if (status === "NEEDS_REVIEW") return "amber";
  if (status === "FAILED") return "red";
  return "slate";
}

export function RankingTable({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: RankedCandidateRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<RankedCandidateRow[]>(initial);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [readyFilter, setReadyFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0, running: 0 });
  const [compareOpen, setCompareOpen] = useState(false);
  const { optionId, setOptionId, option, requestBody } = useAiModelSelection();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const singleEstimate = useEstimatedAnalysisPercent(
    analyzing && progress.total === 1 && progress.done === 0
  );
  const batchPercent =
    progress.total > 1
      ? analysisPercent(progress.done, progress.total, progress.running)
      : progress.total === 1 && progress.done >= 1
        ? 100
        : singleEstimate;
  const displayPercent = analyzing ? batchPercent : 0;

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

  async function refresh() {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/candidates`);
      const data = await res.json();
      if (res.ok && data.success) setRows(data.candidates as RankedCandidateRow[]);
    } catch {
      /* ignore */
    }
  }

  async function analyzeOne(candidateId: string) {
    setRows((prev) =>
      prev.map((r) => (r.candidate_id === candidateId ? { ...r, status: "ANALYZING" } : r))
    );
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/candidates/${candidateId}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Analysis failed.", "error");
        setRows((prev) =>
          prev.map((r) => (r.candidate_id === candidateId ? { ...r, status: "FAILED" } : r))
        );
        return false;
      }
      return true;
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.candidate_id === candidateId ? { ...r, status: "FAILED" } : r))
      );
      return false;
    }
  }

  async function analyzeSingle(candidateId: string) {
    if (availability && !availability[option.provider]?.available) {
      toast(
        availability[option.provider]?.message ??
          `${option.label} is unavailable.`,
        "error"
      );
      return;
    }
    setAnalyzing(true);
    setProgress({ total: 1, done: 0, running: 1 });
    const ok = await analyzeOne(candidateId);
    setProgress({ total: 1, done: 1, running: 0 });
    setAnalyzing(false);
    await refresh();
    router.refresh();
    if (ok) toast("Analysis complete.", "success");
  }

  async function analyzeAllReady() {
    const selectedProvider = option.provider;
    if (availability && !availability[selectedProvider]?.available) {
      toast(
        availability[selectedProvider]?.message ??
          `${option.label} is unavailable.`,
        "error"
      );
      return;
    }

    const ready = rows.filter((r) => r.status === "READY" || r.status === "NEEDS_REVIEW");
    if (ready.length === 0) {
      toast("No candidates are ready to analyze.", "info");
      return;
    }
    setAnalyzing(true);
    setProgress({ total: ready.length, done: 0, running: 0 });

    // Keep concurrency low to avoid provider rate limits across a batch.
    const concurrency = 2;
    let index = 0;
    let done = 0;

    async function worker() {
      while (index < ready.length) {
        const current = ready[index++];
        setProgress((p) => ({ ...p, running: p.running + 1 }));
        await analyzeOne(current.candidate_id);
        done += 1;
        setProgress((p) => ({ total: p.total, done, running: p.running - 1 }));
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, ready.length) }, worker));
    setAnalyzing(false);
    await refresh();
    router.refresh();
    toast("Batch analysis complete.", "success");
  }

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.match_category).filter(Boolean))) as string[],
    [rows]
  );

  const view = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => (r.full_name ?? "").toLowerCase().includes(q));
    }
    if (catFilter) list = list.filter((r) => r.match_category === catFilter);
    if (readyFilter) list = list.filter((r) => r.submission_readiness === readyFilter);

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * (a.full_name ?? "").localeCompare(b.full_name ?? "");
        case "category":
          return dir * (a.match_category ?? "").localeCompare(b.match_category ?? "");
        case "readiness":
          return dir * (a.submission_readiness ?? "").localeCompare(b.submission_readiness ?? "");
        case "verification":
          return dir * ((a.mandatory_verify ?? 0) - (b.mandatory_verify ?? 0));
        case "date":
          return dir * ((a.analyzed_at ? Date.parse(a.analyzed_at) : 0) - (b.analyzed_at ? Date.parse(b.analyzed_at) : 0));
        case "score":
        default:
          return dir * ((a.match_score ?? -1) - (b.match_score ?? -1));
      }
    });
    return list;
  }, [rows, search, catFilter, readyFilter, sortKey, sortDir]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const selectedEntries = view
    .filter((r) => selected[r.candidate_id] && r.latest_analysis_id)
    .map((r) => ({
      analysisId: r.latest_analysis_id as string,
      name: r.full_name ?? "Unnamed candidate",
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <AiModelSelector
          value={optionId}
          onChange={setOptionId}
          disabled={analyzing}
          availability={availability}
        />
        <Button onClick={analyzeAllReady} disabled={analyzing}>
          {analyzing
            ? `${option.loadingLabel.replace(/…$/, "")} ${displayPercent}%`
            : "Analyze All Ready Candidates"}
        </Button>
        <span className="pb-2 text-xs text-slate-500">
          Using <span className="font-medium text-slate-700">{option.label}</span>
        </span>
        {selectedIds.length >= 2 && selectedEntries.length >= 2 && (
          <Button variant="outline" onClick={() => setCompareOpen(true)}>
            Compare Selected ({selectedEntries.length})
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            placeholder="Search name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
          />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
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
            className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
          >
            <option value="">All readiness</option>
            {Object.entries(READINESS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
            className="h-8 rounded-lg border border-slate-300 px-2 text-xs"
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
      </div>

      {analyzing && (
        <AnalysisProgressBar
          percent={displayPercent}
          label={option.loadingLabel}
          detail={
            progress.total > 1
              ? `${progress.done} of ${progress.total} candidates completed · ${progress.running} processing · ${Math.max(progress.total - progress.done - progress.running, 0)} waiting`
              : "Working on this candidate — percentage is an estimate until the model finishes."
          }
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Candidate</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Model</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2" title="Mandatory confirmed">Conf.</th>
              <th className="px-2 py-2" title="Needs verification">Verify</th>
              <th className="px-2 py-2" title="Clearly not met">Not met</th>
              <th className="px-2 py-2">Readiness</th>
              <th className="px-2 py-2">Recommended</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.candidate_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 text-slate-400">
                  <div className="flex items-center gap-1">
                    {r.latest_analysis_id && (
                      <input
                        type="checkbox"
                        checked={!!selected[r.candidate_id]}
                        onChange={() => toggleSelect(r.candidate_id, !!r.latest_analysis_id)}
                        aria-label="Select to compare"
                      />
                    )}
                    {i + 1}
                  </div>
                </td>
                <td className="px-2 py-2 font-medium text-slate-800">
                  <Link
                    href={`/candidates/${r.candidate_id}?w=${workspaceId}`}
                    className="hover:text-brand-700"
                  >
                    {r.full_name || "Unnamed candidate"}
                  </Link>
                  {r.disposition && (
                    <span className="ml-2 text-[10px] uppercase text-slate-400">{r.disposition.replace(/_/g, " ")}</span>
                  )}
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
                  {r.match_category ? DISPLAY_CATEGORY[r.match_category as MatchCategory] ?? r.match_category : "—"}
                </td>
                <td className="px-2 py-2 text-green-700">{r.mandatory_confirmed ?? "—"}</td>
                <td className="px-2 py-2 text-amber-700">{r.mandatory_verify ?? "—"}</td>
                <td className="px-2 py-2 text-red-700">{r.mandatory_not_met ?? "—"}</td>
                <td className="px-2 py-2 text-slate-600">
                  {r.submission_readiness ? READINESS_LABEL[r.submission_readiness] ?? r.submission_readiness : "—"}
                </td>
                <td className="px-2 py-2 text-slate-600">
                  {r.recommended_action ? ACTION_LABEL[r.recommended_action] ?? r.recommended_action : "—"}
                </td>
                <td className="px-2 py-2">
                  <Badge tone={statusTone(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-2 py-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => analyzeSingle(r.candidate_id)}
                      disabled={analyzing || r.status === "ANALYZING"}
                    >
                      {r.status === "ANALYZING"
                        ? `${displayPercent}%`
                        : r.latest_analysis_id
                          ? "Reanalyze"
                          : "Analyze"}
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
            ))}
          </tbody>
        </table>
      </div>

      {compareOpen && (
        <CompareDialog entries={selectedEntries} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  );
}
