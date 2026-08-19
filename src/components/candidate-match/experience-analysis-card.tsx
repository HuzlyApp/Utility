"use client";

import React from "react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ClockIcon, CheckIcon, AlertIcon } from "@/components/ui/icons";
import type { AiResult } from "@/lib/clientTypes";

function yearsLabel(value: number | null): string {
  if (value == null) return "—";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded} yrs`;
}

function Flag({ confirmed, label }: { confirmed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      {confirmed ? (
        <CheckIcon className="h-4 w-4 flex-none text-green-600" />
      ) : (
        <AlertIcon className="h-4 w-4 flex-none text-amber-600" />
      )}
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-800">
          {confirmed ? "Confirmed" : "Not documented"}
        </p>
      </div>
    </div>
  );
}

export function ExperienceAnalysisCard({ result }: { result: AiResult }) {
  const exp = result.experience_analysis;
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
        title="Experience Analysis"
        description="Calculated from dated employment only — not summary claims."
        icon={<ClockIcon className="h-5 w-5 text-blue-600" />}
        action={
          exp.is_estimated ? <Badge tone="amber">Estimated</Badge> : undefined
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {m.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Flag
            confirmed={exp.travel_experience_confirmed}
            label="Travel experience"
          />
          <Flag
            confirmed={exp.required_work_setting_experience_confirmed}
            label="Required work setting"
          />
        </div>

        {exp.experience_calculation_notes.length > 0 ? (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Calculation notes
            </h4>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
              {exp.experience_calculation_notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No additional experience calculation notes.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
