"use client";

import React from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { MatchScoreRing } from "./match-score-ring";
import {
  CATEGORY_SOFT,
  CATEGORY_TONE,
  READINESS_META,
} from "./status";
import { cn } from "@/lib/cn";
import {
  ScanIcon,
  ShieldIcon,
  ClipboardIcon,
  DownloadIcon,
} from "@/components/ui/icons";
import type { AiResult, MandatorySummary } from "@/lib/clientTypes";
import { DISPLAY_ACTION } from "@/lib/types";

export function MatchSummaryCard({
  result,
  mandatory,
  onStartScreening,
  onAddVerified,
  onViewRequirements,
  onDownloadReport,
}: {
  result: AiResult;
  mandatory: MandatorySummary;
  onStartScreening?: () => void;
  onAddVerified?: () => void;
  onViewRequirements?: () => void;
  onDownloadReport?: () => void;
}) {
  const cm = result.candidate_match;
  const soft = CATEGORY_SOFT[cm.match_category];
  const readiness = READINESS_META[result.submission_readiness.readiness_status];
  const verifyItems =
    result.submission_readiness.blocking_requirements.length > 0
      ? result.submission_readiness.blocking_requirements
      : result.submission_readiness.items_to_verify_before_submission;

  return (
    <Card className={cn("overflow-hidden border", soft.border)}>
      <div className={cn("grid gap-6 p-6 md:grid-cols-[240px,1fr]", soft.bg)}>
        {/* Left: score ring + category + confidence + readiness */}
        <div className="flex flex-col items-center gap-3 text-center">
          <MatchScoreRing
            score={cm.recommended_overall_match_score}
            label="Match Score"
            size={148}
            colorClass={soft.ring}
          />
          <Badge tone={CATEGORY_TONE[cm.match_category]}>
            {cm.display_category}
          </Badge>
          <div className="flex w-full justify-center gap-4 text-xs text-slate-500">
            <span>
              Confidence
              <span className="ml-1 font-semibold text-slate-800">
                {cm.confidence_score}%
              </span>
            </span>
            <span>
              Readiness
              <span className={cn("ml-1 font-semibold", soft.accent)}>
                {readiness.label}
              </span>
            </span>
          </div>
        </div>

        {/* Right: plain-language summary + action + verify items + buttons */}
        <div className="flex flex-col">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className={cn("text-xl font-semibold", soft.accent)}>
              {cm.display_category}
            </h2>
            <span className="text-sm font-medium text-slate-500">
              Score: {cm.recommended_overall_match_score}%
            </span>
          </div>

          <p className="text-[15px] leading-relaxed text-slate-700">
            {cm.recruiter_decision_summary}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-500">
              Recommended action:
            </span>
            <Badge tone="blue">{DISPLAY_ACTION[cm.recommended_action]}</Badge>
          </div>

          {/* Mandatory summary line with corrected terminology */}
          <p className="mt-3 text-sm text-slate-600">
            <span className="font-semibold text-green-700">
              {mandatory.confirmed} confirmed
            </span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="font-semibold text-amber-700">
              {mandatory.to_verify} to verify
            </span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span className="font-semibold text-red-700">
              {mandatory.not_met} clearly not met
            </span>
          </p>

          {verifyItems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {verifyItems.slice(0, 4).map((it, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-slate-400"
                  />
                  {it}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={onStartScreening}>
              <ScanIcon className="h-4 w-4" />
              Start Screening
            </Button>
            <Button variant="secondary" onClick={onAddVerified}>
              <ShieldIcon className="h-4 w-4" />
              Add Verified Information
            </Button>
            <Button variant="ghost" onClick={onViewRequirements}>
              <ClipboardIcon className="h-4 w-4" />
              View Requirements
            </Button>
            <Button variant="ghost" onClick={onDownloadReport}>
              <DownloadIcon className="h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>
      </div>

      {cm.mandatory_requirement_override && (
        <div className="border-t border-red-100 bg-red-50 px-6 py-2 text-sm font-medium text-red-800">
          A mandatory requirement is clearly not met — verify before any
          submission decision.
        </div>
      )}
    </Card>
  );
}
