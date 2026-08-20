"use client";

import React from "react";
import { Button } from "@/components/ui/primitives";
import type { AnalysisMode } from "@/lib/types";

export function AnalysisModeButtons({
  onSelect,
  disabled,
  busyMode,
  progressLabel,
  hasAnalysis,
  failed,
  size = "sm",
  layout = "row",
}: {
  onSelect: (mode: AnalysisMode) => void;
  disabled?: boolean;
  busyMode?: AnalysisMode | null;
  progressLabel?: string;
  hasAnalysis?: boolean;
  failed?: boolean;
  size?: "sm" | "md";
  layout?: "row" | "stack";
}) {
  const busy = Boolean(busyMode);
  const analyzeLabel =
    busyMode === "analyze"
      ? progressLabel ?? "Analyzing…"
      : failed
        ? "Retry"
        : hasAnalysis
          ? "Reanalyze"
          : "Analyze";
  const deepLabel =
    busyMode === "deep"
      ? progressLabel ?? "Deeper analysis…"
      : "Deeper Analysis";

  return (
    <div
      className={
        layout === "stack"
          ? "flex flex-col items-stretch gap-2"
          : "flex flex-wrap items-center gap-2"
      }
    >
      <Button
        size={size}
        variant="primary"
        onClick={() => onSelect("analyze")}
        disabled={disabled || busy}
        title="Faster evidence-based match analysis"
      >
        {analyzeLabel}
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={() => onSelect("deep")}
        disabled={disabled || busy}
        title="Full detailed analysis with recruiter narrative"
      >
        {deepLabel}
      </Button>
    </div>
  );
}
