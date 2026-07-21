"use client";

import React from "react";
import { Button, Tooltip } from "@/components/ui/primitives";
import { SparklesIcon, InfoIcon, ClipboardIcon } from "@/components/ui/icons";

export function CandidateMatchHeader({
  onNewAnalysis,
  showNewAnalysis,
}: {
  onNewAnalysis?: () => void;
  showNewAnalysis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-2xl">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-[26px] font-semibold leading-tight text-slate-900 sm:text-[30px]">
            Candidate-to-Job Match Analyzer
          </h1>
        </div>
        <p className="text-sm text-slate-500 sm:text-[15px]">
          Compare a healthcare job requirement with a candidate résumé and
          receive an explainable Grok AI-assisted match assessment.
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          <SparklesIcon className="h-3.5 w-3.5 text-brand-600" />
          Powered by Grok AI
          <Tooltip content="Grok AI assists with requirement comparison. The recruiter makes the final decision.">
            <InfoIcon className="h-3.5 w-3.5 text-slate-400" />
          </Tooltip>
        </div>
      </div>
      {showNewAnalysis && (
        <div className="flex flex-none gap-2">
          <Button variant="secondary" size="sm" onClick={onNewAnalysis}>
            <ClipboardIcon className="h-4 w-4" />
            Start New Analysis
          </Button>
        </div>
      )}
    </div>
  );
}
