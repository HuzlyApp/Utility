"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StatusOption } from "@/components/candidate/candidate-status-select";
import {
  formatStatusIdsParam,
  parseHasMatchedJobParam,
  parseStatusIdsParam,
} from "@/lib/candidate-list-table";
import { cn } from "@/lib/cn";

export interface RecruiterOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export interface JobOption {
  id: string;
  job_title: string | null;
}

function Select({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-[140px]", className)}>
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        className="h-[38px] w-full rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800 sm:h-10 sm:text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

const FILTER_KEYS = [
  "status",
  "assigned",
  "mine",
  "createdBy",
  "job",
  "matchedJob",
] as const;

function StatusMultiSelect({
  statuses,
  selectedIds,
  onChange,
}: {
  statuses: StatusOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeStatuses = useMemo(
    () => statuses.filter((s) => s.is_active !== false),
    [statuses]
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

  const label =
    selectedIds.length === 0
      ? "All statuses"
      : selectedIds.length === 1
        ? activeStatuses.find((s) => s.id === selectedIds[0])?.name ??
          "1 status"
        : `${selectedIds.length} statuses`;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-[160px] flex-[1_1_160px]">
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Status
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[38px] w-full items-center justify-between gap-2 rounded-md border bg-white px-2 text-left text-[13px] text-slate-800 sm:h-10 sm:text-sm",
          selectedIds.length > 0
            ? "border-brand-300 ring-1 ring-brand-200"
            : "border-slate-300"
        )}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 z-30 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg sm:w-[280px]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Select statuses
            </span>
            {selectedIds.length > 0 ? (
              <button
                type="button"
                className="text-[12px] font-medium text-brand-700 hover:underline"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            ) : null}
          </div>
          {activeStatuses.map((s) => {
            const checked = selectedIds.includes(s.id);
            return (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color || "#94a3b8" }}
                  aria-hidden
                />
                <span className="truncate">{s.name}</span>
              </label>
            );
          })}
          {activeStatuses.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-slate-500">
              No statuses available.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CandidateListFilters({
  statuses,
  recruiters,
  jobs,
  currentUserId,
}: {
  statuses: StatusOption[];
  recruiters: RecruiterOption[];
  jobs: JobOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedStatusIds = useMemo(
    () => parseStatusIdsParam(searchParams.get("status")) ?? [],
    [searchParams]
  );

  const matchedJobFilter = useMemo(() => {
    const parsed = parseHasMatchedJobParam(searchParams.get("matchedJob"));
    if (parsed === true) return "1";
    if (parsed === false) return "0";
    return "";
  }, [searchParams]);

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const update = useCallback(
    (key: string, value: string) => {
      pushParams((params) => {
        if (!value) params.delete(key);
        else params.set(key, value);
        if (key === "mine" && value === "1") params.delete("assigned");
        if (key === "assigned") params.delete("mine");
      });
    },
    [pushParams]
  );

  const hasActiveFilters = useMemo(
    () => FILTER_KEYS.some((key) => Boolean(searchParams.get(key))),
    [searchParams]
  );

  const activeFilterCount = useMemo(
    () => FILTER_KEYS.filter((key) => Boolean(searchParams.get(key))).length,
    [searchParams]
  );

  const clearFiltersHref = useMemo(() => {
    const params = new URLSearchParams();
    const preserve = ["search", "filter", "sort", "dir"] as const;
    for (const key of preserve) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const labelOf = (r: RecruiterOption) => r.full_name || r.email || r.user_id;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 shadow-sm",
        hasActiveFilters ? "border-brand-200" : "border-slate-200"
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-slate-600">
          Filters
          {hasActiveFilters ? (
            <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
              {activeFilterCount} active
            </span>
          ) : null}
        </p>
        <Link
          href={clearFiltersHref}
          aria-disabled={!hasActiveFilters}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[12px] font-medium sm:text-[13px]",
            hasActiveFilters
              ? "border border-slate-300 text-slate-600 hover:bg-slate-50"
              : "pointer-events-none text-slate-400"
          )}
        >
          Clear filters
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-2.5 lg:gap-3">
        <StatusMultiSelect
          statuses={statuses}
          selectedIds={selectedStatusIds}
          onChange={(ids) =>
            update("status", ids.length ? formatStatusIdsParam(ids) : "")
          }
        />
        <Select
          label="Matched job"
          className="min-w-[160px] flex-[1_1_160px]"
          value={matchedJobFilter}
          onChange={(v) => update("matchedJob", v)}
        >
          <option value="">Any</option>
          <option value="1">Has matched job</option>
          <option value="0">No matched job</option>
        </Select>
        <Select
          label="Assigned Recruiter"
          className="min-w-[160px] flex-[1_1_160px]"
          value={
            searchParams.get("mine") === "1"
              ? "__mine__"
              : (searchParams.get("assigned") ?? "")
          }
          onChange={(v) => {
            if (v === "__mine__") {
              update("mine", "1");
              return;
            }
            pushParams((params) => {
              params.delete("mine");
              if (!v) params.delete("assigned");
              else params.set("assigned", v);
            });
          }}
        >
          <option value="">Anyone</option>
          <option value="__mine__">My Candidates</option>
          <option value="unassigned">Unassigned</option>
          {recruiters.map((r) => (
            <option key={r.user_id} value={r.user_id}>
              {labelOf(r)}
              {r.user_id === currentUserId ? " (you)" : ""}
            </option>
          ))}
        </Select>
        <Select
          label="Created By"
          className="min-w-[160px] flex-[1_1_160px]"
          value={searchParams.get("createdBy") ?? ""}
          onChange={(v) => update("createdBy", v)}
        >
          <option value="">Anyone</option>
          {recruiters.map((r) => (
            <option key={r.user_id} value={r.user_id}>
              {labelOf(r)}
            </option>
          ))}
        </Select>
        <Select
          label="Job"
          className="min-w-[160px] flex-[1_1_160px]"
          value={searchParams.get("job") ?? ""}
          onChange={(v) => update("job", v)}
        >
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.job_title || "Untitled job"}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
