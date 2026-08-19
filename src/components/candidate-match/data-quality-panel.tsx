"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import { Card, CardBody } from "@/components/ui/primitives";
import { ChevronDownIcon } from "@/components/ui/icons";
import type { AiResult } from "@/lib/clientTypes";

export function DataQualityPanel({
  result,
  scoreAdjustments,
  defaultOpen = false,
}: {
  result: AiResult;
  scoreAdjustments: string[];
  defaultOpen?: boolean;
}) {
  const dq = result.data_quality;
  const hasNotes =
    dq.missing_information.length > 0 ||
    dq.job_description_conflicts.length > 0 ||
    dq.resume_conflicts.length > 0 ||
    scoreAdjustments.length > 0;
  const [open, setOpen] = useState(defaultOpen || hasNotes);

  const sections: { title: string; items: string[] }[] = [
    { title: "Missing information", items: dq.missing_information },
    { title: "Job-description conflicts", items: dq.job_description_conflicts },
    { title: "Résumé conflicts", items: dq.resume_conflicts },
    { title: "Score adjustments", items: scoreAdjustments },
  ];

  return (
    <Card>
      <button
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">
            Data Quality &amp; Analysis Notes
          </h3>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Résumé completeness: {dq.resume_completeness} · Job completeness:{" "}
            {dq.job_description_completeness}
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
        <CardBody className="animate-fade-in space-y-4 border-t border-slate-100">
          {sections.map((s) => (
            <div key={s.title}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {s.title}
              </h4>
              {s.items.length === 0 ? (
                <p className="text-sm text-slate-400">None.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                  {s.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}
