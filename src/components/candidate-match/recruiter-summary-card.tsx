"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ClipboardIcon } from "@/components/ui/icons";
import type { AiResult } from "@/lib/clientTypes";

export function RecruiterSummaryCard({ result }: { result: AiResult }) {
  const summary = result.candidate_match.recruiter_decision_summary?.trim() ?? "";
  const note = result.candidate_match.submission_note?.trim() ?? "";
  if (!summary && !note) return null;

  return (
    <Card>
      <CardHeader
        title="Recruiter summary"
        description="Internal read plus a client-ready submission note."
        icon={<ClipboardIcon className="h-5 w-5 text-slate-600" />}
      />
      <CardBody className="space-y-4">
        {summary ? (
          <p className="text-[15px] leading-relaxed text-slate-700">{summary}</p>
        ) : null}
        {note ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Submission note
            </p>
            <blockquote className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              {note}
            </blockquote>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
