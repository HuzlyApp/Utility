"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, AlertIcon, InfoIcon } from "@/components/ui/icons";
import { READINESS_META } from "./status";
import type { AiResult } from "@/lib/clientTypes";
import type { SubmissionReadiness } from "@/lib/types";

const BANNER_STYLE: Record<SubmissionReadiness, string> = {
  READY_TO_SUBMIT: "border-green-200 bg-green-50 text-green-900",
  VERIFY_BEFORE_SUBMISSION: "border-amber-200 bg-amber-50 text-amber-900",
  NOT_CURRENTLY_SUBMITTABLE: "border-red-200 bg-red-50 text-red-900",
  INSUFFICIENT_INFORMATION: "border-slate-200 bg-slate-50 text-slate-800",
};

function icon(status: SubmissionReadiness) {
  if (status === "READY_TO_SUBMIT")
    return <CheckIcon className="h-5 w-5 text-green-600" />;
  if (status === "NOT_CURRENTLY_SUBMITTABLE")
    return <AlertIcon className="h-5 w-5 text-red-600" />;
  if (status === "VERIFY_BEFORE_SUBMISSION")
    return <AlertIcon className="h-5 w-5 text-amber-600" />;
  return <InfoIcon className="h-5 w-5 text-slate-500" />;
}

export function SubmissionReadinessBanner({ result }: { result: AiResult }) {
  const status = result.submission_readiness.readiness_status;
  const meta = READINESS_META[status];
  const blocking = result.submission_readiness.blocking_requirements;
  const toVerify = result.submission_readiness.items_to_verify_before_submission;
  const explanation =
    blocking[0] ??
    toVerify[0] ??
    (status === "READY_TO_SUBMIT"
      ? "All documented mandatory requirements are confirmed."
      : "Review the qualification checklist below for details.");

  return (
    <div className={cn("rounded-xl border p-4", BANNER_STYLE[status])}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-none">{icon(status)}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="mt-0.5 text-sm opacity-90">{explanation}</p>
          {blocking.length > 0 && (
            <p className="mt-1 text-xs font-medium">
              {blocking.length} blocking item{blocking.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
