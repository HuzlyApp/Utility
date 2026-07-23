"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Expected single-analysis duration for the indeterminate estimate (ms). */
const ESTIMATED_ANALYSIS_MS = 55_000;

export function analysisPercent(done: number, total: number, running = 0): number {
  if (total <= 0) return 0;
  if (done >= total) return 100;
  // Credit in-flight work so the bar moves before the first completion.
  const weighted = done + running * 0.4;
  return Math.min(99, Math.round((weighted / total) * 100));
}

/**
 * Time-based estimate for a single in-flight analysis request.
 * Caps below 100% until the caller marks complete.
 */
export function useEstimatedAnalysisPercent(active: boolean): number {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!active) {
      setPercent(0);
      return;
    }
    const started = Date.now();
    setPercent(3);
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started;
      // Ease toward ~92% over ESTIMATED_ANALYSIS_MS, then creep slowly.
      const ratio = Math.min(1, elapsed / ESTIMATED_ANALYSIS_MS);
      const eased = 1 - Math.pow(1 - ratio, 1.6);
      const next = Math.min(92, Math.round(3 + eased * 89));
      setPercent(next);
    }, 400);
    return () => window.clearInterval(id);
  }, [active]);

  return percent;
}

export function AnalysisProgressBar({
  percent,
  label,
  detail,
  className,
}: {
  percent: number;
  label: string;
  detail?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={cn(
        "rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900",
        className
      )}
      role="status"
      aria-live="polite"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums font-semibold text-blue-800">{clamped}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-xs text-blue-700/80">{detail}</p>}
    </div>
  );
}
