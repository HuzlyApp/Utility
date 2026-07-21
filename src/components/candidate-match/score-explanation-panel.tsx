"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import { Card, CardBody } from "@/components/ui/primitives";
import { ChevronDownIcon } from "@/components/ui/icons";
import { SUBSCORE_WEIGHTS, type SubscoreKey } from "@/lib/types";
import type { AiResult } from "@/lib/clientTypes";

const LABELS: Record<SubscoreKey, string> = {
  mandatory_requirements_score: "Mandatory requirements",
  specialty_experience_score: "Specialty experience",
  clinical_skills_score: "Clinical skills",
  licenses_certifications_score: "Licenses and certifications",
  work_setting_equipment_score: "Work setting and equipment",
  preferred_qualifications_score: "Preferred qualifications",
};

export function ScoreExplanationPanel({ result }: { result: AiResult }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(SUBSCORE_WEIGHTS) as SubscoreKey[];

  return (
    <Card>
      <button
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">
            How this score was calculated
          </h3>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Weighted subscores. Validated in the application, not by the model.
          </p>
        </div>
        <ChevronDownIcon
          className={cn(
            "h-5 w-5 flex-none text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <CardBody className="animate-fade-in border-t border-slate-100">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 text-right font-semibold">Weight</th>
                  <th className="px-3 py-2 text-right font-semibold">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => (
                  <tr key={k}>
                    <td className="px-3 py-2 text-slate-700">{LABELS[k]}</td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {Math.round(SUBSCORE_WEIGHTS[k] * 100)}%
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">
                      {result.subscores[k]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Missing résumé information reduces confidence but does not
            automatically prove that a candidate lacks a qualification.
          </p>
        </CardBody>
      )}
    </Card>
  );
}
