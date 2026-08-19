"use client";

import React from "react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ClockIcon } from "@/components/ui/icons";
import { parseLabeledItem } from "@/lib/match-display";
import type { AiResult } from "@/lib/clientTypes";

function yearsLabel(value: number | null): string {
  if (value == null) return "—";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded} yrs`;
}

export function ExperienceAnalysisCard({ result }: { result: AiResult }) {
  const exp = result.experience_analysis;
  const notes = exp.experience_calculation_notes;
  const metrics = [
    {
      label: "Total professional",
      value: yearsLabel(exp.total_professional_experience_years),
    },
    {
      label: "Relevant specialty",
      value: yearsLabel(exp.relevant_specialty_experience_years),
    },
    {
      label: "Recent relevant",
      value: yearsLabel(exp.recent_relevant_experience_years),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Experience calculation"
        description="Dated employment only. Specialty ownership and recent roles are weighted against the JD — not summary claims."
        icon={<ClockIcon className="h-5 w-5 text-blue-600" />}
        action={
          exp.is_estimated ? <Badge tone="amber">Estimated</Badge> : undefined
        }
      />
      <CardBody className="space-y-4">
        {notes.length > 0 ? (
          <ul className="space-y-2.5">
            {notes.map((raw, i) => {
              const item = parseLabeledItem(raw);
              return (
                <li
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  {item.label ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-800">
                        {item.detail}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-800">{item.detail}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            No qualitative experience notes were returned. Years below are from
            dated employment only.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-slate-200 px-3 py-2 text-center"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {m.label}
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
