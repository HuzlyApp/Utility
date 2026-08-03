"use client";

import React from "react";
import { Button } from "@/components/ui/primitives";
import type { DatePreset } from "@/lib/recruiter-activity";
import { cn } from "@/lib/cn";

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "custom", label: "Custom" },
];

export function DateRangeFilters({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomChange,
}: {
  preset: DatePreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: DatePreset) => void;
  onCustomChange: (from: string, to: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              preset === p.id
                ? "bg-brand-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomChange(e.target.value, customTo)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomChange(customFrom, e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!customFrom || !customTo}
            onClick={() => onCustomChange(customFrom, customTo)}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
