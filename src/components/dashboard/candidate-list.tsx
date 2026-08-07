"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialItems);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const kickoffKeyRef = useRef<string | null>(null);
  const pollStartedRef = useRef<number | null>(null);
  const pollGenRef = useRef(0);
  const retryInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setRows(initialItems);
  }, [initialItems]);

  const queryString = searchParams.toString();
  const returnTo = queryString ? `/candidates?${queryString}` : "/candidates";

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
    if (kickoffKeyRef.current === queryString) return;
    kickoffKeyRef.current = queryString;
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
  }, [canViewContact, queryString, initialItems, refreshList]);

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

  if (rows.length === 0) {
    return (
      <CandidateEmptyState
        searchActive={searchActive}
        searchQuery={searchQuery}
        clearSearchHref={clearSearchHref}
      />
    );
  }

  return (
    <>
      {canViewContact && failedRetryCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
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
        </div>
      ) : null}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
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
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                    Job code
                  </dt>
                  <dd className="whitespace-nowrap">
                    {displayOrDash(row.job_code)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                    Matched job
                  </dt>
                  <dd className="line-clamp-2">
                    {displayOrDash(row.job_title)}
                  </dd>
                </div>
                {canViewContact ? (
                  <>
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
                  </>
                ) : null}
              </dl>
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
            </li>
          );
        })}
      </ul>

      <Card className="hidden md:block">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed text-left text-[13px] leading-[1.35]">
              <colgroup>
                <col style={{ width: "190px" }} />
                <col style={{ width: "85px" }} />
                {canViewContact ? (
                  <>
                    <col style={{ width: "135px" }} />
                    <col style={{ width: "190px" }} />
                  </>
                ) : null}
                <col style={{ width: "190px" }} />
                <col style={{ width: "85px" }} />
                <col style={{ width: "190px" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "145px" }} />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">
                    Candidate
                  </th>
                  <th className="px-3 py-2 font-medium">Job Code</th>
                  {canViewContact ? (
                    <>
                      <th className="px-3 py-2 font-medium">Phone Number</th>
                      <th className="px-3 py-2 font-medium">Email Address</th>
                    </>
                  ) : null}
                  <th className="px-3 py-2 font-medium">Matched job</th>
                  <th className="px-3 py-2 font-medium">Match</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Assigned</th>
                  <th className="px-3 py-2 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const name = displayCandidateName(row.full_name);
                  const retrying = retryingId === row.candidate_id;
                  return (
                    <tr
                      key={`${row.candidate_id}-${row.workspace_id ?? "none"}`}
                      className="align-top hover:bg-slate-50/80"
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 hover:bg-slate-50/80">
                        <Link
                          href={candidateHref(
                            row.candidate_id,
                            row.workspace_id
                          )}
                          aria-label={`View ${name} candidate details`}
                          className="line-clamp-2 font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-sm"
                        >
                          {name}
                        </Link>
                        <p className="mt-0.5 text-[12px] leading-[1.3] text-slate-400">
                          {[row.specialty, row.location]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {displayOrDash(row.job_code)}
                      </td>
                      {canViewContact ? (
                        <>
                          <td
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
                              onRetry={() =>
                                void retryExtraction(row.candidate_id)
                              }
                              href={
                                row.phone?.trim()
                                  ? `tel:${row.phone.replace(/[^\d+]/g, "")}`
                                  : null
                              }
                            />
                          </td>
                          <td
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
                              onRetry={() =>
                                void retryExtraction(row.candidate_id)
                              }
                              href={
                                row.email?.trim()
                                  ? `mailto:${row.email.trim()}`
                                  : null
                              }
                            />
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-2.5 text-slate-600">
                        <span className="line-clamp-3">
                          {displayOrDash(row.job_title)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p
                          className={`text-[13px] font-semibold ${scoreTone(row.match_score)}`}
                        >
                          {row.match_score != null
                            ? `${row.match_score}%`
                            : "—"}
                        </p>
                        <p className="text-[11px] leading-[1.3] text-slate-400">
                          {row.match_category
                            ? DISPLAY_CATEGORY[
                                row.match_category as MatchCategory
                              ] ?? row.match_category
                            : ""}
                        </p>
                      </td>
                      <td
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
                      <td className="px-3 py-2.5 text-[12px] leading-[1.3] text-slate-600">
                        <span className="line-clamp-2">
                          {row.assigned_recruiter_name || "Unassigned"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] leading-[1.3] text-slate-500">
                        <p className="line-clamp-1">
                          {row.updated_by_name || "—"}
                        </p>
                        <p>{formatTimestamp(row.updated_at)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
