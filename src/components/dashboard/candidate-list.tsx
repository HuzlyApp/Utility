"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, CardBody } from "@/components/ui/primitives";
import { candidateRoutes } from "@/lib/routes";
import { DISPLAY_CATEGORY, type MatchCategory } from "@/lib/types";
import type { DashboardCandidateRow } from "@/lib/dal/candidates";
import type { StatusOption } from "@/components/candidate/candidate-status-select";
import { CandidateStatusSelect } from "@/components/candidate/candidate-status-select";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import { displayOrDash } from "@/lib/candidate-crm";
import { displayCandidateName } from "@/lib/resume-name";
import {
  CONTACT_EXTRACTION_POLL_MAX_MS,
  CONTACT_EXTRACTION_POLL_MS,
  getContactFieldUiState,
  isContactExtractionInFlight,
  needsContactExtractionRetry,
} from "@/lib/contact-extract";
import {
  CANDIDATE_COLUMNS,
  COLUMN_VISIBILITY_STORAGE_KEY,
  DEFAULT_CANDIDATE_SORT,
  DEFAULT_CANDIDATE_SORT_DIR,
  defaultVisibleColumns,
  parseCandidateSortParam,
  parseSortDirParam,
  parseVisibleColumns,
  sortDashboardCandidates,
  type CandidateColumnId,
  type CandidateSortKey,
} from "@/lib/candidate-list-table";
import { cn } from "@/lib/cn";

function scoreTone(score: number | null): string {
  if (score == null) return "text-slate-400";
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-slate-600";
}

function ContactField({
  value,
  status,
  startedAt,
  attempts,
  canViewContact,
  nowrap,
  href,
  field,
  candidateName,
  retrying,
  onRetry,
}: {
  value: string | null | undefined;
  status: string | null | undefined;
  startedAt?: string | null;
  attempts?: number | null;
  canViewContact: boolean;
  nowrap?: boolean;
  href?: string | null;
  field: "email" | "phone";
  candidateName: string;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const ui = getContactFieldUiState({
    value,
    extractionStatus: status,
    canViewContact,
    startedAt,
    attempts,
    field,
  });

  if (ui.kind === "value") {
    const content = (
      <span className={nowrap ? "whitespace-nowrap" : "break-all"}>{ui.label}</span>
    );
    if (href && !ui.label.startsWith("Invalid")) {
      return (
        <a href={href} className="text-brand-700 hover:underline">
          {content}
        </a>
      );
    }
    return content;
  }

  if (ui.kind === "extracting" || retrying) {
    return (
      <span
        className={
          nowrap
            ? "inline-flex items-center gap-1 whitespace-nowrap text-slate-600"
            : "inline-flex items-center gap-1 break-all text-slate-600"
        }
      >
        <span
          className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-slate-300 border-t-brand-600"
          aria-hidden
        />
        {retrying ? "Extracting…" : ui.label}
      </span>
    );
  }

  if (ui.kind === "retryable") {
    return (
      <span
        className={
          nowrap
            ? "inline-flex flex-wrap items-center gap-x-1 whitespace-nowrap text-slate-600"
            : "inline-flex flex-wrap items-center gap-x-1 break-all text-slate-600"
        }
      >
        <span>{ui.label}</span>
        <span aria-hidden>·</span>
        {ui.canRetry && onRetry ? (
          <button
            type="button"
            className="cursor-pointer font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={retrying}
            aria-label={`Retry contact extraction for ${candidateName}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry();
            }}
          >
            Retry
          </button>
        ) : (
          <span className="text-slate-500">Retry</span>
        )}
      </span>
    );
  }

  return <span className="text-slate-500">{ui.label}</span>;
}

function CandidateEmptyState({
  searchActive,
  searchQuery,
  clearSearchHref,
}: {
  searchActive: boolean;
  searchQuery?: string;
  clearSearchHref: string;
}) {
  if (searchActive) {
    return (
      <Card>
        <CardBody className="space-y-3 py-10 text-center">
          <p className="text-sm text-slate-600">No candidates match your search.</p>
          {searchQuery ? (
            <p className="text-xs text-slate-400">
              No results for “{searchQuery}”.
            </p>
          ) : null}
          <Link
            href={clearSearchHref}
            className="inline-flex text-sm font-medium text-brand-700 hover:underline"
          >
            Clear search
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="py-10 text-center text-sm text-slate-500">
        No candidates match this filter.
      </CardBody>
    </Card>
  );
}

function SortableHeader({
  label,
  column,
  activeKey,
  activeDir,
  onSort,
  sticky,
}: {
  label: string;
  column: CandidateSortKey;
  activeKey: CandidateSortKey;
  activeDir: "asc" | "desc";
  onSort: (key: CandidateSortKey) => void;
  sticky?: boolean;
}) {
  const active = activeKey === column;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        sticky && "sticky left-0 z-10 bg-slate-50"
      )}
      aria-sort={
        active ? (activeDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-sm text-left uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
          active ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
        )}
      >
        <span className="truncate">{label}</span>
        <span
          className={cn(
            "shrink-0 text-[10px]",
            active ? "text-brand-600" : "text-slate-300"
          )}
          aria-hidden
        >
          {active ? (activeDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function ColumnVisibilityControl({
  canViewContact,
  visible,
  onChange,
}: {
  canViewContact: boolean;
  visible: Set<CandidateColumnId>;
  onChange: (next: CandidateColumnId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = useMemo(
    () =>
      CANDIDATE_COLUMNS.filter((c) => !c.contactOnly || canViewContact),
    [canViewContact]
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hiddenCount = options.filter((c) => !visible.has(c.id)).length;

  function toggle(id: CandidateColumnId, required?: boolean) {
    if (required) return;
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Preserve column definition order.
    onChange(options.filter((c) => next.has(c.id)).map((c) => c.id));
  }

  function reset() {
    onChange(defaultVisibleColumns(canViewContact));
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Columns
        {hiddenCount > 0 ? (
          <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
            {options.length - hiddenCount}/{options.length}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Customize columns"
          className="absolute right-0 z-30 mt-1 w-[240px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Visible columns
            </span>
            <button
              type="button"
              className="text-[12px] font-medium text-brand-700 hover:underline"
              onClick={reset}
            >
              Reset
            </button>
          </div>
          {options.map((col) => {
            const checked = visible.has(col.id);
            return (
              <label
                key={col.id}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-slate-700",
                  col.required
                    ? "cursor-default opacity-70"
                    : "cursor-pointer hover:bg-slate-50"
                )}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
                  checked={checked}
                  disabled={col.required}
                  onChange={() => toggle(col.id, col.required)}
                />
                <span className="truncate">{col.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function CandidateList({
  items: initialItems,
  statuses,
  canViewContact = true,
  searchActive = false,
  searchQuery = "",
  clearSearchHref = "/candidates",
}: {
  items: DashboardCandidateRow[];
  statuses: StatusOption[];
  canViewContact?: boolean;
  searchActive?: boolean;
  searchQuery?: string;
  clearSearchHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialItems);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState<CandidateColumnId[]>(
    () => defaultVisibleColumns(canViewContact)
  );
  const [columnsHydrated, setColumnsHydrated] = useState(false);
  const kickoffKeyRef = useRef<string | null>(null);
  const pollStartedRef = useRef<number | null>(null);
  const pollGenRef = useRef(0);
  const retryInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setRows(initialItems);
  }, [initialItems]);

  useEffect(() => {
    try {
      const stored = parseVisibleColumns(
        window.localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY),
        canViewContact
      );
      if (stored) setVisibleColumnIds(stored);
      else setVisibleColumnIds(defaultVisibleColumns(canViewContact));
    } catch {
      setVisibleColumnIds(defaultVisibleColumns(canViewContact));
    }
    setColumnsHydrated(true);
  }, [canViewContact]);

  const setVisibleColumns = useCallback(
    (next: CandidateColumnId[]) => {
      const ordered = CANDIDATE_COLUMNS.filter(
        (c) => (!c.contactOnly || canViewContact) && next.includes(c.id)
      ).map((c) => c.id);
      for (const col of CANDIDATE_COLUMNS) {
        if (
          col.required &&
          (!col.contactOnly || canViewContact) &&
          !ordered.includes(col.id)
        ) {
          ordered.unshift(col.id);
        }
      }
      setVisibleColumnIds(ordered);
      try {
        window.localStorage.setItem(
          COLUMN_VISIBILITY_STORAGE_KEY,
          JSON.stringify(ordered)
        );
      } catch {
        /* ignore */
      }
    },
    [canViewContact]
  );

  const queryString = searchParams.toString();
  const returnTo = queryString ? `/candidates?${queryString}` : "/candidates";

  /** Filter/search identity for extraction kickoff — exclude sort so header clicks don't re-queue. */
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sort");
    params.delete("dir");
    return params.toString();
  }, [searchParams]);

  const sortKey = parseCandidateSortParam(searchParams.get("sort"));
  const sortDir = parseSortDirParam(
    searchParams.get("dir") ??
      (sortKey === DEFAULT_CANDIDATE_SORT ? DEFAULT_CANDIDATE_SORT_DIR : "desc")
  );

  const setSort = useCallback(
    (key: CandidateSortKey) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextDir =
        sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
      // Match / score / updated feel more natural starting descending.
      const initialDesc =
        key === "match" || key === "updated" || key === "status";
      const dir =
        sortKey === key ? nextDir : initialDesc ? "desc" : "asc";
      if (key === DEFAULT_CANDIDATE_SORT && dir === DEFAULT_CANDIDATE_SORT_DIR) {
        params.delete("sort");
        params.delete("dir");
      } else {
        params.set("sort", key);
        params.set("dir", dir);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, sortDir, sortKey]
  );

  const visibleSet = useMemo(
    () => new Set(visibleColumnIds),
    [visibleColumnIds]
  );

  const visibleColumns = useMemo(
    () =>
      CANDIDATE_COLUMNS.filter(
        (c) =>
          (!c.contactOnly || canViewContact) && visibleSet.has(c.id)
      ),
    [canViewContact, visibleSet]
  );

  const sortedRows = useMemo(
    () => sortDashboardCandidates(rows, sortKey, sortDir),
    [rows, sortKey, sortDir]
  );

  const candidateHref = useCallback(
    (candidateId: string, workspaceId?: string | null) =>
      candidateRoutes.detail(candidateId, workspaceId, returnTo),
    [returnTo]
  );

  const refreshList = useCallback(async () => {
    const gen = pollGenRef.current;
    try {
      const res = await fetch(`/api/candidates?${queryString}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success || gen !== pollGenRef.current) return;
      setRows(data.candidates as DashboardCandidateRow[]);
    } catch {
      /* next poll recovers */
    }
  }, [queryString]);

  const hasExtracting = useMemo(
    () =>
      rows.some((r) =>
        isContactExtractionInFlight(
          r.contact_extraction_status,
          r.contact_extraction_started_at
        )
      ),
    [rows]
  );

  // Kick off background extraction once per filter/search identity (server is idempotent).
  useEffect(() => {
    if (!canViewContact) return;
    if (kickoffKeyRef.current === filterQueryString) return;
    kickoffKeyRef.current = filterQueryString;
    pollGenRef.current += 1;
    const ids = initialItems.map((r) => r.candidate_id);
    void fetch("/api/candidates/contact-extraction/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateIds: ids,
        limit: Math.min(Math.max(ids.length || 25, 25), 50),
      }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        await refreshList();
      })
      .catch(() => {
        /* ignore */
      });
  }, [canViewContact, filterQueryString, initialItems, refreshList]);

  useEffect(() => {
    if (!hasExtracting) {
      pollStartedRef.current = null;
      return;
    }
    if (pollStartedRef.current == null) {
      pollStartedRef.current = Date.now();
    }
    const gen = pollGenRef.current;
    const pollId = window.setInterval(() => {
      if (gen !== pollGenRef.current) {
        window.clearInterval(pollId);
        return;
      }
      const started = pollStartedRef.current ?? Date.now();
      if (Date.now() - started > CONTACT_EXTRACTION_POLL_MAX_MS) {
        window.clearInterval(pollId);
        pollStartedRef.current = null;
        return;
      }
      void refreshList();
    }, CONTACT_EXTRACTION_POLL_MS);
    return () => window.clearInterval(pollId);
  }, [hasExtracting, refreshList]);

  const failedRetryCount = useMemo(
    () =>
      rows.filter((r) =>
        needsContactExtractionRetry({
          email: r.email,
          phone: r.phone,
          status: r.contact_extraction_status,
          attempts: r.contact_extraction_attempts,
          startedAt: r.contact_extraction_started_at,
        })
      ).length,
    [rows]
  );

  async function retryExtraction(candidateId: string) {
    if (retryInFlightRef.current.has(candidateId)) return;
    retryInFlightRef.current.add(candidateId);
    setRetryingId(candidateId);
    // Optimistic: show Extracting… immediately for this row.
    setRows((prev) =>
      prev.map((r) =>
        r.candidate_id === candidateId
          ? {
              ...r,
              contact_extraction_status: "processing",
              contact_extraction_started_at: new Date().toISOString(),
              contact_extraction_error: null,
            }
          : r
      )
    );
    try {
      const res = await fetch(
        `/api/candidates/${candidateId}/contact-extraction/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setRows((prev) =>
          prev.map((r) =>
            r.candidate_id === candidateId
              ? {
                  ...r,
                  email: data.email ?? r.email,
                  phone: data.phone ?? data.phone_number ?? r.phone,
                  contact_extraction_status:
                    data.status ??
                    data.contact_extraction?.status ??
                    r.contact_extraction_status,
                  contact_extraction_attempts:
                    data.attempts ??
                    data.attempt ??
                    r.contact_extraction_attempts,
                  contact_extraction_error: data.error ?? null,
                  contact_extraction_started_at: new Date().toISOString(),
                }
              : r
          )
        );
        // Keep polling if still in-flight.
        if (
          data.status === "queued" ||
          data.status === "processing" ||
          data.contact_extraction?.status === "queued" ||
          data.contact_extraction?.status === "processing"
        ) {
          await refreshList();
        }
      } else {
        await refreshList();
      }
    } finally {
      retryInFlightRef.current.delete(candidateId);
      setRetryingId(null);
    }
  }

  async function bulkRetryFailed() {
    if (bulkRetrying) return;
    setBulkRetrying(true);
    setBulkMessage(null);
    try {
      const failedIds = rows
        .filter((r) =>
          needsContactExtractionRetry({
            email: r.email,
            phone: r.phone,
            status: r.contact_extraction_status,
            attempts: r.contact_extraction_attempts,
            startedAt: r.contact_extraction_started_at,
          })
        )
        .map((r) => r.candidate_id);
      const res = await fetch("/api/candidates/contact-extraction/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: failedIds,
          limit: Math.min(Math.max(failedIds.length || 25, 10), 40),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setBulkMessage(
          data.message ??
            `Retrying contact extraction for ${data.queued ?? 0} candidates…`
        );
        await refreshList();
      } else {
        setBulkMessage(data.error ?? "Bulk retry failed.");
      }
    } finally {
      setBulkRetrying(false);
    }
  }

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {canViewContact && failedRetryCount > 0 ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={bulkRetrying}
              onClick={() => void bulkRetryFailed()}
            >
              {bulkRetrying
                ? "Retrying…"
                : `Retry failed contact extraction (${failedRetryCount})`}
            </Button>
            {bulkMessage ? (
              <p className="text-xs text-slate-500">{bulkMessage}</p>
            ) : null}
          </>
        ) : (
          <span className="sr-only">Candidate list</span>
        )}
      </div>
      {columnsHydrated ? (
        <ColumnVisibilityControl
          canViewContact={canViewContact}
          visible={visibleSet}
          onChange={setVisibleColumns}
        />
      ) : null}
    </div>
  );

  if (rows.length === 0) {
    return (
      <>
        {toolbar}
        <CandidateEmptyState
          searchActive={searchActive}
          searchQuery={searchQuery}
          clearSearchHref={clearSearchHref}
        />
      </>
    );
  }

  function renderCell(row: DashboardCandidateRow, columnId: CandidateColumnId) {
    const name = displayCandidateName(row.full_name);
    const retrying = retryingId === row.candidate_id;
    switch (columnId) {
      case "candidate":
        return (
          <td
            key={columnId}
            className="sticky left-0 z-10 bg-white px-3 py-2.5 hover:bg-slate-50/80"
          >
            <Link
              href={candidateHref(row.candidate_id, row.workspace_id)}
              aria-label={`View ${name} candidate details`}
              className="line-clamp-2 font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-sm"
            >
              {name}
            </Link>
            <p className="mt-0.5 text-[12px] leading-[1.3] text-slate-400">
              {[row.specialty, row.location].filter(Boolean).join(" · ") || "—"}
            </p>
          </td>
        );
      case "jobCode":
        return (
          <td
            key={columnId}
            className="whitespace-nowrap px-3 py-2.5 text-slate-600"
          >
            {displayOrDash(row.job_code)}
          </td>
        );
      case "phone":
        return (
          <td
            key={columnId}
            className="px-3 py-2.5 text-slate-600"
            onClick={(e) => e.stopPropagation()}
          >
            <ContactField
              value={row.phone}
              status={row.contact_extraction_status}
              startedAt={row.contact_extraction_started_at}
              attempts={row.contact_extraction_attempts}
              canViewContact={canViewContact}
              nowrap
              field="phone"
              candidateName={name}
              retrying={retrying}
              onRetry={() => void retryExtraction(row.candidate_id)}
              href={
                row.phone?.trim()
                  ? `tel:${row.phone.replace(/[^\d+]/g, "")}`
                  : null
              }
            />
          </td>
        );
      case "email":
        return (
          <td
            key={columnId}
            className="px-3 py-2.5 text-slate-600"
            onClick={(e) => e.stopPropagation()}
          >
            <ContactField
              value={row.email}
              status={row.contact_extraction_status}
              startedAt={row.contact_extraction_started_at}
              attempts={row.contact_extraction_attempts}
              canViewContact={canViewContact}
              field="email"
              candidateName={name}
              retrying={retrying}
              onRetry={() => void retryExtraction(row.candidate_id)}
              href={
                row.email?.trim() ? `mailto:${row.email.trim()}` : null
              }
            />
          </td>
        );
      case "matchedJob":
        return (
          <td key={columnId} className="px-3 py-2.5 text-slate-600">
            {row.job_title?.trim() ? (
              <span className="line-clamp-3">{row.job_title}</span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                No matched job
              </span>
            )}
          </td>
        );
      case "match":
        return (
          <td key={columnId} className="px-3 py-2.5">
            <p
              className={`text-[13px] font-semibold ${scoreTone(row.match_score)}`}
            >
              {row.match_score != null ? `${row.match_score}%` : "—"}
            </p>
            <p className="text-[11px] leading-[1.3] text-slate-400">
              {row.match_category
                ? DISPLAY_CATEGORY[row.match_category as MatchCategory] ??
                  row.match_category
                : ""}
            </p>
          </td>
        );
      case "status":
        return (
          <td
            key={columnId}
            className="px-3 py-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <CandidateStatusSelect
              candidateId={row.candidate_id}
              candidateName={row.full_name}
              statuses={statuses}
              value={row.current_status_id}
              statusName={row.status_name}
              statusColor={row.status_color}
              showAttribution={false}
              className="[&_button]:min-w-0 [&_button]:max-w-full [&_button]:text-[13px]"
              onChanged={() => router.refresh()}
            />
          </td>
        );
      case "assigned":
        return (
          <td
            key={columnId}
            className="px-3 py-2.5 text-[12px] leading-[1.3] text-slate-600"
          >
            <span className="line-clamp-2">
              {row.assigned_recruiter_name || "Unassigned"}
            </span>
          </td>
        );
      case "updated":
        return (
          <td
            key={columnId}
            className="px-3 py-2.5 text-[12px] leading-[1.3] text-slate-500"
          >
            <p className="line-clamp-1">{row.updated_by_name || "—"}</p>
            <p>{formatTimestamp(row.updated_at)}</p>
          </td>
        );
      default:
        return null;
    }
  }

  const minTableWidth = Math.max(
    640,
    visibleColumns.reduce((sum, c) => sum + Number.parseInt(c.width, 10), 0)
  );

  return (
    <>
      {toolbar}
      <ul className="space-y-3 md:hidden">
        {sortedRows.map((row) => {
          const href = candidateHref(row.candidate_id, row.workspace_id);
          const name = displayCandidateName(row.full_name);
          const retrying = retryingId === row.candidate_id;
          return (
            <li
              key={`${row.candidate_id}-${row.workspace_id ?? "none"}`}
              className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={href}
                    aria-label={`View ${name} candidate details`}
                    className="text-[14px] font-medium leading-[1.35] text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-sm"
                  >
                    {name}
                  </Link>
                  <p className="mt-0.5 text-[12px] leading-[1.3] text-slate-500">
                    {[row.specialty, row.location].filter(Boolean).join(" · ") ||
                      "—"}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-[13px] font-semibold ${scoreTone(row.match_score)}`}
                >
                  {row.match_score != null ? `${row.match_score}%` : "—"}
                </p>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] leading-[1.3] text-slate-600">
                {visibleSet.has("jobCode") ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                      Job code
                    </dt>
                    <dd className="whitespace-nowrap">
                      {displayOrDash(row.job_code)}
                    </dd>
                  </div>
                ) : null}
                {visibleSet.has("matchedJob") ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                      Matched job
                    </dt>
                    <dd className="line-clamp-2">
                      {row.job_title?.trim()
                        ? row.job_title
                        : "No matched job"}
                    </dd>
                  </div>
                ) : null}
                {canViewContact && visibleSet.has("phone") ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                      Phone
                    </dt>
                    <dd>
                      <ContactField
                        value={row.phone}
                        status={row.contact_extraction_status}
                        startedAt={row.contact_extraction_started_at}
                        attempts={row.contact_extraction_attempts}
                        canViewContact={canViewContact}
                        nowrap
                        field="phone"
                        candidateName={name}
                        retrying={retrying}
                        onRetry={() => void retryExtraction(row.candidate_id)}
                        href={
                          row.phone?.trim()
                            ? `tel:${row.phone.replace(/[^\d+]/g, "")}`
                            : null
                        }
                      />
                    </dd>
                  </div>
                ) : null}
                {canViewContact && visibleSet.has("email") ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                      Email
                    </dt>
                    <dd>
                      <ContactField
                        value={row.email}
                        status={row.contact_extraction_status}
                        startedAt={row.contact_extraction_started_at}
                        attempts={row.contact_extraction_attempts}
                        canViewContact={canViewContact}
                        field="email"
                        candidateName={name}
                        retrying={retrying}
                        onRetry={() => void retryExtraction(row.candidate_id)}
                        href={
                          row.email?.trim()
                            ? `mailto:${row.email.trim()}`
                            : null
                        }
                      />
                    </dd>
                  </div>
                ) : null}
              </dl>
              {visibleSet.has("status") ? (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <CandidateStatusSelect
                    candidateId={row.candidate_id}
                    candidateName={row.full_name}
                    statuses={statuses}
                    value={row.current_status_id}
                    statusName={row.status_name}
                    statusColor={row.status_color}
                    showAttribution={false}
                    fullWidth
                    className="[&_button]:text-[13px]"
                    onChanged={() => router.refresh()}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Card className="hidden md:block">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table
              className="w-full table-fixed text-left text-[13px] leading-[1.35]"
              style={{ minWidth: `${minTableWidth}px` }}
            >
              <colgroup>
                {visibleColumns.map((col) => (
                  <col key={col.id} style={{ width: col.width }} />
                ))}
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  {visibleColumns.map((col) =>
                    col.sortable && col.sortKey ? (
                      <SortableHeader
                        key={col.id}
                        label={col.label}
                        column={col.sortKey}
                        activeKey={sortKey}
                        activeDir={sortDir}
                        onSort={setSort}
                        sticky={col.id === "candidate"}
                      />
                    ) : (
                      <th
                        key={col.id}
                        className={cn(
                          "px-3 py-2 font-medium",
                          col.id === "candidate" &&
                            "sticky left-0 z-10 bg-slate-50"
                        )}
                      >
                        {col.label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row) => (
                  <tr
                    key={`${row.candidate_id}-${row.workspace_id ?? "none"}`}
                    className="align-top hover:bg-slate-50/80"
                  >
                    {visibleColumns.map((col) => renderCell(row, col.id))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
