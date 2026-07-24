"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";

export type StepState = "upcoming" | "active" | "completed" | "error";

export interface StepDef {
  id: string;
  label: string;
  description: string;
}

export const WORKFLOW_STEPS: StepDef[] = [
  {
    id: "job",
    label: "Job Requirements",
    description: "Upload or paste the MSP job requirements.",
  },
  {
    id: "candidate",
    label: "Candidate Information",
    description: "Add the candidate résumé and any verified details.",
  },
  {
    id: "result",
    label: "Match Assessment",
    description: "Review the AI-assisted recommendation.",
  },
];

export function CandidateMatchStepper({
  activeIndex,
  completed,
  onStepClick,
}: {
  activeIndex: number;
  completed: boolean[];
  onStepClick: (index: number) => void;
}) {
  const active = WORKFLOW_STEPS[activeIndex];
  return (
    <nav aria-label="Workflow progress">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
        {WORKFLOW_STEPS.map((step, i) => {
          const state: StepState =
            i === activeIndex
              ? "active"
              : completed[i]
              ? "completed"
              : "upcoming";
          const clickable = completed[i] && i !== activeIndex;
          return (
            <React.Fragment key={step.id}>
              <li className="flex items-center gap-3 sm:flex-1">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStepClick(i)}
                  aria-current={state === "active" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-1 text-left transition",
                    clickable ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold transition-colors",
                      state === "active" &&
                        "bg-brand-600 text-white ring-4 ring-brand-100",
                      state === "completed" && "bg-brand-600 text-white",
                      state === "upcoming" && "bg-slate-200 text-slate-500"
                    )}
                  >
                    {state === "completed" ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="flex flex-col">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        state === "upcoming"
                          ? "text-slate-400"
                          : "text-slate-800"
                      )}
                    >
                      {step.label}
                    </span>
                  </span>
                </button>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "mx-2 hidden h-px flex-1 sm:block",
                      completed[i] ? "bg-brand-500" : "bg-slate-200"
                    )}
                  />
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      <p className="mt-3 text-[13px] text-slate-500">
        Step {activeIndex + 1} of {WORKFLOW_STEPS.length} — {active.description}
      </p>
    </nav>
  );
}
