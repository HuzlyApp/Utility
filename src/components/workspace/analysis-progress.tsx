"use client";

import React from "react";
import { cn } from "@/lib/cn";
import {
  STAGE_LABEL,
  STAGE_PROGRESS,
  type AnalysisProgressStage,
  type AnalysisProgressEvent,
} from "@/lib/analysis-stages";

export function analysisPercent(done: number, total: number, running = 0): number {
  if (total <= 0) return 0;
  if (done >= total) return 100;
  // Credit in-flight work so the bar moves before the first completion.
  const weighted = done + running * 0.4;
  return Math.min(99, Math.round((weighted / total) * 100));
}

export function stageFromEvent(event: AnalysisProgressEvent): {
  stage: AnalysisProgressStage;
  percent: number;
  label: string;
} {
  const stage = event.stage;
  const percent =
    typeof event.progress === "number"
      ? Math.max(0, Math.min(100, event.progress))
      : STAGE_PROGRESS[stage];
  return {
    stage,
    percent,
    label: event.message || STAGE_LABEL[stage],
  };
}

/**
 * @deprecated Use streamed stage progress instead. Kept for any remaining callers;
 * never caps at a misleading static value while active.
 */
export function useEstimatedAnalysisPercent(active: boolean): number {
  const [percent, setPercent] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setPercent(0);
      return;
    }
    // Hold at the analyzing stage until the caller marks complete.
    setPercent(STAGE_PROGRESS.analyzing);
  }, [active]);

  return percent;
}

export function AnalysisProgressBar({
  percent,
  label,
  detail,
  indeterminate,
  className,
}: {
  percent: number;
  label: string;
  detail?: string;
  /** When true, show a sliding shimmer instead of a stuck static fill. */
  indeterminate?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const showIndeterminate = Boolean(indeterminate) && clamped < 100;

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
      aria-valuenow={showIndeterminate ? undefined : clamped}
      aria-busy={clamped < 100}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        {!showIndeterminate && (
          <span className="tabular-nums font-semibold text-blue-800">{clamped}%</span>
        )}
        {showIndeterminate && (
          <span className="text-xs font-medium text-blue-700/80">In progress</span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
        {showIndeterminate ? (
          <div className="analysis-progress-indeterminate h-full w-1/3 rounded-full bg-brand-600" />
        ) : (
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
      {detail && <p className="mt-1.5 text-xs text-blue-700/80">{detail}</p>}
    </div>
  );
}
