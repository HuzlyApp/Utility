"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { normalizeSearchQuery } from "@/lib/candidate-crm";
import { SearchIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const DEBOUNCE_MS = 350;

export function JobSearchInput({
  initialQuery = "",
  placeholder = "Search jobs by title or job code",
  label = "Search job workspaces by title or job code",
  className,
  inputClassName,
  paramName = "q",
  resetPageParam = "page",
  onPendingChange,
}: {
  initialQuery?: string;
  placeholder?: string;
  /** Accessible label for the search field. */
  label?: string;
  className?: string;
  inputClassName?: string;
  paramName?: string;
  /** When search changes, this query param is reset to page 1 / removed. */
  resetPageParam?: string | null;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    const normalized = normalizeSearchQuery(query);
    const current = normalizeSearchQuery(searchParams.get(paramName) ?? "");
    if (normalized === current) return;

    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (normalized) params.set(paramName, normalized);
      else params.delete(paramName);
      if (resetPageParam) params.delete(resetPageParam);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [
    query,
    pathname,
    router,
    searchParams,
    startTransition,
    paramName,
    resetPageParam,
  ]);

  function clear() {
    setQuery("");
  }

  return (
    <div className={cn("relative w-full", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <SearchIcon
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const normalized = normalizeSearchQuery(query);
            const params = new URLSearchParams(searchParams.toString());
            if (normalized) params.set(paramName, normalized);
            else params.delete(paramName);
            if (resetPageParam) params.delete(resetPageParam);
            const qs = params.toString();
            startTransition(() => {
              router.replace(qs ? `${pathname}?${qs}` : pathname, {
                scroll: false,
              });
            });
          }
        }}
        placeholder={placeholder}
        className={cn(
          "h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-20 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          isPending && "opacity-80",
          inputClassName
        )}
        autoComplete="off"
        aria-busy={isPending || undefined}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {isPending ? (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
            aria-hidden
          />
        ) : null}
        {query ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear search"
          >
            <XIcon className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
