"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { StatusOption } from "@/components/candidate/candidate-status-select";
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

const FILTER_KEYS = ["status", "assigned", "mine", "createdBy", "job"] as const;

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

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value) params.delete(key);
      else params.set(key, value);
      // Mine and assigned are mutually exclusive UX
      if (key === "mine" && value === "1") params.delete("assigned");
      if (key === "assigned") params.delete("mine");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const hasActiveFilters = useMemo(
    () => FILTER_KEYS.some((key) => Boolean(searchParams.get(key))),
    [searchParams]
  );

  const clearFiltersHref = useMemo(() => {
    const params = new URLSearchParams();
    const search = searchParams.get("search");
    const filter = searchParams.get("filter");
    if (search) params.set("search", search);
    if (filter) params.set("filter", filter);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const labelOf = (r: RecruiterOption) => r.full_name || r.email || r.user_id;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-2.5 lg:gap-3">
        <Select
          label="Status"
          className="min-w-[160px] flex-[1_1_160px]"
          value={searchParams.get("status") ?? ""}
          onChange={(v) => update("status", v)}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
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
            const params = new URLSearchParams(searchParams.toString());
            params.delete("mine");
            if (!v) params.delete("assigned");
            else params.set("assigned", v);
            const qs = params.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
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
        <div className="flex min-w-[120px] flex-[0_0_auto] items-end">
          <Link
            href={clearFiltersHref}
            aria-disabled={!hasActiveFilters}
            className={cn(
              "inline-flex h-[38px] w-full items-center justify-center rounded-md px-3 text-[13px] font-medium sm:h-10 sm:text-sm",
              hasActiveFilters
                ? "border border-slate-300 text-slate-600 hover:bg-slate-50"
                : "pointer-events-none border border-transparent text-slate-400"
            )}
          >
            Clear Filters
          </Link>
        </div>
      </div>
    </div>
  );
}
