"use client";

import React from "react";
import { Card, CardBody } from "@/components/ui/primitives";
import { CheckIcon, SparklesIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { AnalysisProgressEvent } from "@/lib/analysis-stages";

interface AnalysisLoadingStateProps {
  progress?: AnalysisProgressEvent | null;
}

const STAGES = [
  { key: "queued", label: "Queued…" },
  { key: "extracting", label: "Extracting résumé content…" },
  { key: "preparing", label: "Preparing candidate data…" },
  { key: "analyzing", label: "Analyzing with AI…" },
  { key: "validating", label: "Validating result…" },
  { key: "saving", label: "Saving analysis…" },
];

export function AnalysisLoadingState({ progress }: AnalysisLoadingStateProps) {
  // If no real progress is provided, show a static analyzing state.
  const activeStage = progress?.stage ?? "analyzing";
  const activeIndex = STAGES.findIndex((s) => s.key === activeStage);
  const currentIndex = activeIndex >= 0 ? activeIndex : STAGES.length - 1;

  return (
    <Card className="mx-auto max-w-lg animate-fade-in">
      <CardBody className="p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <SparklesIcon className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">
            Analyzing Candidate Match
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {progress?.message ?? "Claude is comparing the résumé against the job requirements."}
          </p>
        </div>

        <ol className="space-y-3">
          {STAGES.map((stage, i) => {
            const done = i < currentIndex;
            const current = i === currentIndex;
            return (
              <li key={stage.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs transition-colors",
                    done && "bg-brand-600 text-white",
                    current && "bg-brand-100 text-brand-700",
                    !done && !current && "bg-slate-100 text-slate-400"
                  )}
                >
                  {done ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : current ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    done && "text-slate-500",
                    current && "font-medium text-slate-900",
                    !done && !current && "text-slate-400"
                  )}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-center text-xs text-slate-400">
          This may take a moment. Do not close this page.
        </p>
      </CardBody>
    </Card>
  );
}
