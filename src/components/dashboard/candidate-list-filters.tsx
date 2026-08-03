"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { StatusOption } from "@/components/candidate/candidate-status-select";

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-[140px] flex-1">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
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

  const labelOf = (r: RecruiterOption) => r.full_name || r.email || r.user_id;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-3">
        <Select
          label="Status"
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
          label="Assigned recruiter"
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
          label="Created by"
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
          label="Last updated by"
          value={searchParams.get("updatedBy") ?? ""}
          onChange={(v) => update("updatedBy", v)}
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
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Updated from
          </span>
          <input
            type="date"
            className="h-9 rounded-md border border-slate-300 px-2 text-sm"
            value={searchParams.get("from") ?? ""}
            onChange={(e) => update("from", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Updated to
          </span>
          <input
            type="date"
            className="h-9 rounded-md border border-slate-300 px-2 text-sm"
            value={searchParams.get("to") ?? ""}
            onChange={(e) => update("to", e.target.value)}
          />
        </label>
        <Link
          href={pathname}
          className="h-9 rounded-md border border-slate-300 px-3 text-sm leading-9 text-slate-600 hover:bg-slate-50"
        >
          Clear filters
        </Link>
      </div>
    </div>
  );
}
