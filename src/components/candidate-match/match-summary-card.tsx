"use client";

import React from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { MatchScoreRing } from "./match-score-ring";
import {
  CATEGORY_HERO,
  CATEGORY_RING_COLOR,
  READINESS_META,
} from "./status";
import { cn } from "@/lib/cn";
import type { AiResult, MandatorySummary } from "@/lib/clientTypes";
import { DISPLAY_ACTION } from "@/lib/types";

export function MatchSummaryCard({
  result,
  mandatory,
}: {
  result: AiResult;
  mandatory: MandatorySummary;
}) {
  const cm = result.candidate_match;
  const readiness = READINESS_META[result.submission_readiness.readiness_status];

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          "bg-gradient-to-r px-6 py-5 text-white",
          CATEGORY_HERO[cm.match_category]
        )}
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
            {cm.display_category}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/95">
          {cm.recruiter_decision_summary}
        </p>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-[auto,1fr] md:items-center">
        <div className="flex justify-center md:justify-start">
          <MatchScoreRing
            score={cm.recommended_overall_match_score}
            label={cm.display_category}
            colorClass={CATEGORY_RING_COLOR[cm.match_category]}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Recommended action">
            {DISPLAY_ACTION[cm.recommended_action]}
          </Metric>
          <Metric label="Confidence">{cm.confidence_score}%</Metric>
          <Metric label="Submission">
            <Badge tone={readiness.tone}>{readiness.label}</Badge>
          </Metric>
          <Metric label="Mandatory">
            <span className="text-green-700">{mandatory.confirmed} ok</span>
            {" · "}
            <span className="text-amber-700">{mandatory.to_verify} verify</span>
            {" · "}
            <span className="text-red-700">{mandatory.not_met} not met</span>
          </Metric>
        </div>
      </div>

      {cm.mandatory_requirement_override && (
        <div className="border-t border-red-100 bg-red-50 px-6 py-2 text-sm font-medium text-red-800">
          A mandatory-requirement override was applied to this result.
        </div>
      )}
    </Card>
  );
}

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-slate-800">{children}</div>
    </div>
  );
}
