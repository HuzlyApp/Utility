"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Tabs, TextInput } from "@/components/ui/primitives";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SearchIcon, XIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { notifyWorkspaceCandidatesChanged } from "@/lib/workspace-events";
import type { ImportCandidateView } from "@/lib/candidate-import-match";

const DEBOUNCE_MS = 400;

type TabValue = "recommended" | "all";

interface ImportSearchResponse {
  success: boolean;
  error?: string;
  candidates: ImportCandidateView[];
  total: number;
  allTotal: number;
  recommendedTotal: number;
  page: number;
  pageSize: number;
  truncated?: boolean;
  job: { id: string; title: string; jobRef: string | null };
  suggestedTags: string[];
  suggestedSkills: string[];
  suggestedRoles: string[];
  facets: {
    locations: string[];
    roles: string[];
    statuses: Array<{ id: string; name: string }>;
  };
}

function scoreTone(score: number): "green" | "emerald" | "amber" | "slate" {
  if (score >= 90) return "green";
  if (score >= 80) return "emerald";
  if (score >= 70) return "amber";
  return "slate";
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-[128px] flex-1">
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function ChipRow({
  label,
  values,
  suggestions,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const unused = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  function add(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <div className="min-w-[160px] flex-1">
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1">
        {values.map((tag) => (
          <button
            key={tag}
            type="button"
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
            onClick={() => onChange(values.filter((v) => v !== tag))}
          >
            {tag}
            <XIcon className="h-3 w-3" />
          </button>
        ))}
        <input
          className="min-w-[7rem] flex-1 border-0 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-slate-400"
          placeholder={values.length ? "" : placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft.replace(/,/g, ""));
            }
            if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {unused.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-brand-300 hover:text-brand-700"
              onClick={() => add(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportCandidatesModal({
  workspaceId,
  jobTitle,
  jobRef,
  isOpen,
  onClose,
  onImported,
}: {
  workspaceId: string;
  jobTitle?: string | null;
  jobRef?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const titleId = useId();
  const { toast } = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<TabValue>("recommended");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("");
  const [minMatch, setMinMatch] = useState("60");
  const [statusId, setStatusId] = useState("");
  const [previousTitle, setPreviousTitle] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ImportSearchResponse | null>(null);
  const [recommendedCount, setRecommendedCount] = useState<number | null>(null);
  const [allCount, setAllCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<ImportCandidateView | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingImportIds, setPendingImportIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, role, skills, tags, location, experience, minMatch, statusId, previousTitle]);

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        tab,
        q: debouncedSearch,
        role,
        skills,
        tags,
        location,
        experience,
        minMatch,
        statusId,
        previousTitle,
        page,
      }),
    [tab, debouncedSearch, role, skills, tags, location, experience, minMatch, statusId, previousTitle, page]
  );

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (role) params.set("role", role);
      if (skills.length) params.set("skills", skills.join(","));
      if (tags.length) params.set("tags", tags.join(","));
      if (location) params.set("location", location);
      if (experience) params.set("experience", experience);
      if (tab === "recommended") {
        params.set("minMatch", minMatch || "60");
      } else if (minMatch && minMatch !== "0") {
        params.set("minMatch", minMatch);
      }
      if (statusId) params.set("status", statusId);
      if (previousTitle) params.set("previousTitle", previousTitle);
      params.set("page", String(page));
      params.set("pageSize", "25");

      const res = await fetch(
        `/api/workspaces/${workspaceId}/candidates/import?${params.toString()}`
      );
      const json = (await res.json()) as ImportSearchResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not search candidates.");
      }
      setData(json);
      setAllCount(json.allTotal);
      if (tab === "recommended") setRecommendedCount(json.recommendedTotal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search candidates.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    isOpen,
    workspaceId,
    tab,
    debouncedSearch,
    role,
    skills,
    tags,
    location,
    experience,
    minMatch,
    statusId,
    previousTitle,
    page,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, queryKey, load]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmOpen && !importing) {
        e.preventDefault();
        if (preview) setPreview(null);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose, preview, confirmOpen, importing]);

  useEffect(() => {
    if (!isOpen) {
      setSearchInput("");
      setDebouncedSearch("");
      setTab("recommended");
      setRole("");
      setSkills([]);
      setTags([]);
      setLocation("");
      setExperience("");
      setMinMatch("60");
      setStatusId("");
      setPreviousTitle("");
      setPage(1);
      setSelected({});
      setPendingImportIds([]);
      setPreview(null);
      setError(null);
      setData(null);
      setRecommendedCount(null);
      setAllCount(null);
    }
  }, [isOpen]);

  const candidates = data?.candidates ?? [];
  const selectable = candidates.filter((c) => !c.alreadyAdded);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selectedCount = selectedIds.length;
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((c) => selected[c.id]);
  const displayTitle = data?.job.title || jobTitle || "this job";
  const displayRef = data?.job.jobRef || jobRef;
  const hasFilters = Boolean(
    searchInput ||
      role ||
      skills.length ||
      tags.length ||
      location ||
      experience ||
      (tab === "all" ? minMatch !== "0" : minMatch !== "60") ||
      statusId ||
      previousTitle
  );

  function clearFilters() {
    setSearchInput("");
    setDebouncedSearch("");
    setRole("");
    setSkills([]);
    setTags([]);
    setLocation("");
    setExperience("");
    setMinMatch(tab === "recommended" ? "60" : "0");
    setStatusId("");
    setPreviousTitle("");
    setPage(1);
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = { ...prev };
      if (allVisibleSelected) {
        for (const c of selectable) delete next[c.id];
      } else {
        for (const c of selectable) next[c.id] = true;
      }
      return next;
    });
  }

  const confirmCount = pendingImportIds.length;

  async function runImport() {
    if (pendingImportIds.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/candidates/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: pendingImportIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Import failed.");
      }
      toast(json.message || "Candidates added.", "success");
      notifyWorkspaceCandidatesChanged(workspaceId);
      setConfirmOpen(false);
      setPendingImportIds([]);
      setSelected({});
      onImported();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed.", "error");
    } finally {
      setImporting(false);
    }
  }

  function openConfirm(ids: string[]) {
    if (ids.length === 0) return;
    setPendingImportIds(ids);
    setConfirmOpen(true);
  }

  function importOne(candidate: ImportCandidateView) {
    if (candidate.alreadyAdded) return;
    const ids = [...new Set([...selectedIds, candidate.id])];
    setSelected((prev) => ({ ...prev, [candidate.id]: true }));
    setPreview(null);
    openConfirm(ids);
  }

  if (!isOpen) return null;

  const start = data ? (data.page - 1) * data.pageSize + (data.total === 0 ? 0 : 1) : 0;
  const end = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const content = (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (importing) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl sm:h-[min(92vh,880px)] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Import Candidates
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Find candidates already in your database that match{" "}
              <span className="font-medium text-slate-700">{displayTitle}</span>
              {displayRef ? ` — Job ID ${displayRef}` : ""}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {preview ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5">
            <CandidatePreview
              candidate={preview}
              onBack={() => setPreview(null)}
              onAdd={() => void importOne(preview)}
            />
          </div>
        ) : (
          <>
            <div className="space-y-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <Tabs
                tabs={[
                  {
                    value: "recommended",
                    label: `Recommended${recommendedCount != null ? ` (${recommendedCount})` : ""}`,
                  },
                  {
                    value: "all",
                    label: `All Candidates${allCount != null ? ` (${allCount.toLocaleString()})` : ""}`,
                  },
                ]}
                value={tab}
                onChange={(v) => {
                  const next = v as TabValue;
                  setTab(next);
                  setMinMatch(next === "recommended" ? "60" : "0");
                }}
              />

              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  autoFocus
                  className="pl-9"
                  placeholder="Search candidates..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search candidates"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterSelect label="Role" value={role} onChange={setRole}>
                  <option value="">All Roles</option>
                  {(data?.suggestedRoles ?? []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect label="Location" value={location} onChange={setLocation}>
                  <option value="">All locations</option>
                  {(data?.facets.locations ?? []).map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect label="Experience" value={experience} onChange={setExperience}>
                  <option value="">Any experience</option>
                  <option value="under3">Under 3 years</option>
                  <option value="3to5">3–5 years</option>
                  <option value="5to10">5–10 years</option>
                  <option value="10plus">10+ years</option>
                </FilterSelect>
                <FilterSelect label="Match Score" value={minMatch} onChange={setMinMatch}>
                  {tab === "all" && <option value="0">Any match</option>}
                  <option value="60">60%+ Possible</option>
                  <option value="70">70%+ Good</option>
                  <option value="80">80%+ Strong</option>
                  <option value="90">90%+ Excellent</option>
                </FilterSelect>
                <FilterSelect label="Status" value={statusId} onChange={setStatusId}>
                  <option value="">All statuses</option>
                  {(data?.facets.statuses ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </FilterSelect>
                <label className="block min-w-[140px] flex-1">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Previous title
                  </span>
                  <input
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800"
                    placeholder="e.g. Product Lead"
                    value={previousTitle}
                    onChange={(e) => setPreviousTitle(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <ChipRow
                  label="Skills"
                  values={skills}
                  suggestions={data?.suggestedSkills ?? []}
                  onChange={setSkills}
                  placeholder="Filter by skills"
                />
                <ChipRow
                  label="Tags"
                  values={tags}
                  suggestions={data?.suggestedTags ?? []}
                  onChange={setTags}
                  placeholder="Filter by tags"
                />
              </div>

              {hasFilters && (
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading && (
                <p className="px-5 py-10 text-center text-sm text-slate-500">
                  Searching candidates…
                </p>
              )}
              {!loading && error && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-red-700">{error}</p>
                  <Button className="mt-3" variant="secondary" size="sm" onClick={() => void load()}>
                    Try again
                  </Button>
                </div>
              )}
              {!loading && !error && candidates.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-slate-800">No candidates found</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try changing your search or removing some filters.
                  </p>
                </div>
              )}
              {!loading && !error && candidates.length > 0 && (
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="Select all visible candidates"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                        />
                      </th>
                      <th className="px-2 py-2 font-medium">Candidate</th>
                      <th className="hidden px-2 py-2 font-medium md:table-cell">Current Role</th>
                      <th className="hidden px-2 py-2 font-medium lg:table-cell">Location</th>
                      <th className="hidden px-2 py-2 font-medium lg:table-cell">Experience</th>
                      <th className="hidden px-2 py-2 font-medium xl:table-cell">Top Skills</th>
                      <th className="hidden px-2 py-2 font-medium xl:table-cell">Tags</th>
                      <th className="px-2 py-2 font-medium">Match</th>
                      <th className="hidden px-2 py-2 font-medium sm:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {candidates.map((c) => (
                      <tr
                        key={c.id}
                        className={cn(
                          "cursor-pointer hover:bg-slate-50",
                          c.alreadyAdded && "bg-slate-50/70"
                        )}
                        onClick={() => setPreview(c)}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.fullName}`}
                            disabled={c.alreadyAdded}
                            checked={Boolean(selected[c.id])}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [c.id]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium text-slate-900">{c.fullName}</div>
                          <div className="text-xs text-slate-500 md:hidden">
                            {c.currentRole || "—"}
                          </div>
                          {c.alreadyAdded && (
                            <Badge tone="slate" className="mt-1">
                              Already Added
                            </Badge>
                          )}
                        </td>
                        <td className="hidden px-2 py-2.5 text-slate-600 md:table-cell">
                          {c.currentRole || "—"}
                        </td>
                        <td className="hidden px-2 py-2.5 text-slate-600 lg:table-cell">
                          {c.location || "—"}
                        </td>
                        <td className="hidden px-2 py-2.5 text-slate-600 lg:table-cell">
                          {c.yearsExperience != null ? `${c.yearsExperience} years` : "—"}
                        </td>
                        <td className="hidden max-w-[14rem] truncate px-2 py-2.5 text-xs text-slate-600 xl:table-cell">
                          {c.topSkills.join(" · ") || "—"}
                        </td>
                        <td className="hidden max-w-[12rem] truncate px-2 py-2.5 text-xs text-slate-600 xl:table-cell">
                          {c.tags.join(" · ") || "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge tone={scoreTone(c.matchScore)}>{c.matchScore}% Match</Badge>
                        </td>
                        <td className="hidden px-2 py-2.5 text-xs text-slate-600 sm:table-cell">
                          {c.statusName || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="text-xs text-slate-500">
            {data && !preview && (
              <>
                Showing {start.toLocaleString()}–{end.toLocaleString()} of{" "}
                {data.total.toLocaleString()} candidates
                {data.truncated ? " (top matches in this search)" : ""}
                {selectedCount > 0 ? ` · ${selectedCount} candidates selected` : ""}
              </>
            )}
            {preview && selectedCount > 0 && `${selectedCount} candidates selected`}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!preview && data && pageCount > 1 && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={selectedCount === 0 || importing}
              onClick={() => openConfirm(selectedIds)}
            >
              Import Selected Candidates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {typeof document === "undefined" ? content : createPortal(content, document.body)}
      <ConfirmModal
        isOpen={confirmOpen}
        title={`Import ${confirmCount} Candidate${confirmCount === 1 ? "" : "s"}?`}
        description={
          <div className="space-y-2">
            <p>
              These candidates will be added to{" "}
              <span className="font-medium text-slate-800">{displayTitle}</span>
              {displayRef ? ` — Job ID ${displayRef}` : ""}.
            </p>
            <ul className="list-disc pl-5 text-sm">
              <li>{confirmCount} candidates selected</li>
              <li>{confirmCount} candidates will be imported</li>
            </ul>
            <p className="text-xs text-slate-500">
              Candidates already on this job are skipped automatically.
            </p>
          </div>
        }
        confirmLabel={`Import ${confirmCount} Candidate${confirmCount === 1 ? "" : "s"}`}
        confirmLoadingLabel="Importing…"
        isLoading={importing}
        onConfirm={() => void runImport()}
        onCancel={() => {
          if (!importing) {
            setConfirmOpen(false);
            setPendingImportIds([]);
          }
        }}
      />
    </>
  );
}

function CandidatePreview({
  candidate,
  onBack,
  onAdd,
}: {
  candidate: ImportCandidateView;
  onBack: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{candidate.fullName}</h3>
        <p className="text-sm text-slate-500">
          {candidate.currentRole || "—"}
          {candidate.location ? ` · ${candidate.location}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={scoreTone(candidate.matchScore)}>
            Match Score: {candidate.matchScore}%
          </Badge>
          {candidate.alreadyAdded && <Badge tone="slate">Already Added</Badge>}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Why they match</h4>
        {candidate.matchReasons.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {candidate.matchReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No detailed match notes for this profile.</p>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Skills</h4>
        <p className="mt-1 text-sm text-slate-600">
          {candidate.topSkills.length ? candidate.topSkills.join(" · ") : "—"}
        </p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Tags</h4>
        <div className="mt-1 flex flex-wrap gap-1">
          {candidate.tags.length ? (
            candidate.tags.map((tag) => (
              <Badge key={tag} tone="slate">
                {tag}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-slate-500">—</span>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-800">Experience</h4>
        {candidate.yearsExperience != null && (
          <p className="mt-1 text-sm text-slate-600">{candidate.yearsExperience} years</p>
        )}
        {candidate.experienceHighlights.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {candidate.experienceHighlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No employment history excerpt available.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back to Results
        </Button>
        <Button type="button" disabled={candidate.alreadyAdded} onClick={onAdd}>
          Add Candidate
        </Button>
      </div>
    </div>
  );
}
