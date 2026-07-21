"use client";

import React from "react";
import { Card } from "@/components/ui/primitives";
import {
  CheckIcon,
  AlertIcon,
  XIcon,
  TrophyIcon,
  ClockIcon,
  InfoIcon,
} from "@/components/ui/icons";
import type { AiResult, MandatorySummary } from "@/lib/clientTypes";

export function MatchMetricGrid({
  result,
  mandatory,
}: {
  result: AiResult;
  mandatory: MandatorySummary;
}) {
  const totalMandatory =
    mandatory.confirmed + mandatory.to_verify + mandatory.not_met;
  const preferredMet = result.preferred_requirements.filter(
    (r) => r.requirement_outcome === "MET"
  ).length;
  const exp = result.experience_analysis.relevant_specialty_experience_years;

  const metrics = [
    {
      icon: <CheckIcon className="h-4 w-4 text-green-600" />,
      label: "Mandatory Confirmed",
      value: `${mandatory.confirmed} of ${totalMandatory}`,
      note:
        mandatory.to_verify > 0
          ? `${mandatory.to_verify} still require verification`
          : "All documented items confirmed",
    },
    {
      icon: <AlertIcon className="h-4 w-4 text-amber-600" />,
      label: "Needs Verification",
      value: `${mandatory.to_verify}`,
      note: "Confirm before submission",
    },
    {
      icon: <XIcon className="h-4 w-4 text-red-600" />,
      label: "Clearly Not Met",
      value: `${mandatory.not_met}`,
      note: mandatory.not_met > 0 ? "Blocks submission" : "None",
    },
    {
      icon: <TrophyIcon className="h-4 w-4 text-emerald-600" />,
      label: "Preferred Qualifications",
      value: `${preferredMet} of ${result.preferred_requirements.length}`,
      note: "Met preferred items",
    },
    {
      icon: <ClockIcon className="h-4 w-4 text-blue-600" />,
      label: "Relevant Experience",
      value: exp === null ? "—" : `${exp} yrs`,
      note: result.experience_analysis.is_estimated
        ? "Estimated from résumé"
        : "Documented specialty experience",
    },
    {
      icon: <InfoIcon className="h-4 w-4 text-slate-500" />,
      label: "Confidence",
      value: `${result.candidate_match.confidence_score}%`,
      note: "Analysis confidence",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {metrics.map((m) => (
        <Card key={m.label} className="p-4">
          <div className="mb-1 flex items-center gap-2">
            {m.icon}
            <span className="text-xs font-medium text-slate-500">
              {m.label}
            </span>
          </div>
          <p className="text-2xl font-semibold text-slate-900">{m.value}</p>
          <p className="mt-0.5 text-xs text-slate-400">{m.note}</p>
        </Card>
      ))}
    </div>
  );
}
