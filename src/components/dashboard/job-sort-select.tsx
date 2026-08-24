"use client";

import { useId, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_JOB_SORT,
  DEFAULT_JOB_SORT_DIR,
  parseJobSortDirParam,
  parseJobSortParam,
  type JobSortDir,
  type JobSortKey,
} from "@/lib/workspace-lists";
import { cn } from "@/lib/cn";

const SORT_OPTIONS: Array<{
  value: `${JobSortKey}:${JobSortDir}`;
  label: string;
}> = [
  { value: "updated:desc", label: "Last updated" },
  { value: "created:desc", label: "Date created (newest)" },
  { value: "created:asc", label: "Date created (oldest)" },
];

export function JobSortSelect({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectId = useId();
  const [isPending, startTransition] = useTransition();

  const sort = parseJobSortParam(searchParams.get("sort"));
  const dir = parseJobSortDirParam(searchParams.get("dir"));
  const value = `${sort}:${dir}` as const;
  const selected = SORT_OPTIONS.some((opt) => opt.value === value)
    ? value
    : `${DEFAULT_JOB_SORT}:${DEFAULT_JOB_SORT_DIR}`;

  function onChange(next: string) {
    const [nextSort, nextDir] = next.split(":") as [JobSortKey, JobSortDir];
    const params = new URLSearchParams(searchParams.toString());
    if (nextSort === DEFAULT_JOB_SORT) params.delete("sort");
    else params.set("sort", nextSort);
    if (nextDir === DEFAULT_JOB_SORT_DIR) params.delete("dir");
    else params.set("dir", nextDir);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <label className={cn("block shrink-0 sm:w-56", className)}>
      <span className="sr-only" id={selectId}>
        Sort jobs
      </span>
      <select
        aria-labelledby={selectId}
        value={selected}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          isPending && "opacity-80"
        )}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
