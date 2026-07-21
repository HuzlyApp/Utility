"use client";

import React from "react";
import { InfoIcon } from "@/components/ui/icons";
import type { AiResult } from "@/lib/clientTypes";

// Neutral (not alarming) information card shown when the result is based on
// incomplete résumé data (spec §17). Never styled as a critical failure.
export function LimitedInfoCard({ result }: { result: AiResult }) {
  const dq = result.data_quality;
  const missing = dq.missing_information;
  const show = dq.resume_completeness !== "HIGH" || missing.length > 0;
  if (!show) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <InfoIcon className="mt-0.5 h-5 w-5 flex-none text-blue-600" />
        <div>
          <p className="text-sm font-semibold text-blue-900">
            Limited Résumé Information
          </p>
          <p className="mt-0.5 text-sm text-blue-800/90">
            Some requirements could not be confirmed from the résumé. Verify
            them during screening before assigning a final disposition — a
            missing detail is not a failed requirement.
          </p>
          {missing.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {missing.slice(0, 6).map((m, i) => (
                <li
                  key={i}
                  className="rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-xs font-medium text-blue-700"
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
