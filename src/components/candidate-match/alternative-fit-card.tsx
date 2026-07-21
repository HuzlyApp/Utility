"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { RefreshIcon } from "@/components/ui/icons";
import type { AiResult } from "@/lib/clientTypes";

export function AlternativeFitCard({ result }: { result: AiResult }) {
  const alt = result.alternative_fit;
  // Render only when an alternative fit exists (spec §20).
  if (!alt.redirect_recommended && alt.possible_job_types.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        title="Possible Alternative Fit"
        icon={<RefreshIcon className="h-5 w-5 text-blue-600" />}
      />
      <CardBody className="space-y-3">
        {alt.redirect_reason && (
          <p className="text-sm text-slate-600">{alt.redirect_reason}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {alt.possible_job_types.map((job, i) => (
            <span
              key={i}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800"
            >
              {job}
            </span>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
