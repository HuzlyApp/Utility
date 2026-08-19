"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { RefreshIcon } from "@/components/ui/icons";
import type { AiResult } from "@/lib/clientTypes";

export function AlternativeFitCard({ result }: { result: AiResult }) {
  const alt = result.alternative_fit;
  if (
    !alt.redirect_recommended &&
    alt.possible_job_types.length === 0 &&
    !alt.redirect_reason.trim()
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        title="Better-fit job types"
        description={
          alt.redirect_recommended
            ? "Redirect is recommended — these roles likely use this candidate better than the current JD."
            : "Adjacent roles if this JD is only a partial fit."
        }
        icon={<RefreshIcon className="h-5 w-5 text-blue-600" />}
      />
      <CardBody className="space-y-3">
        {alt.redirect_reason ? (
          <p className="text-sm text-slate-600">{alt.redirect_reason}</p>
        ) : null}
        {alt.possible_job_types.length > 0 ? (
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
        ) : (
          <p className="text-sm text-slate-400">No alternative job types listed.</p>
        )}
      </CardBody>
    </Card>
  );
}
