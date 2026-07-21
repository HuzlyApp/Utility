"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";

// Quote-style evidence block that clearly separates candidate evidence from AI
// interpretation and recruiter verification (spec §16). Long evidence is
// clamped with an expand toggle.
export function EvidenceBlock({
  evidence,
  source,
  confidence,
}: {
  evidence: string;
  source: string;
  confidence: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = evidence.length > 220;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Candidate evidence
      </p>
      {evidence ? (
        <blockquote className="border-l-2 border-brand-300 pl-3 text-sm italic text-slate-700">
          <span className={cn(!expanded && isLong && "line-clamp-3")}>
            &ldquo;{evidence}&rdquo;
          </span>
        </blockquote>
      ) : (
        <p className="text-sm text-slate-400">No evidence provided.</p>
      )}
      {isLong && (
        <button
          onClick={() => setExpanded((s) => !s)}
          className="mt-1 text-xs font-medium text-brand-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Source: <span className="font-medium">{formatSource(source)}</span> ·
        Confidence: <span className="font-medium">{confidence}%</span>
      </p>
    </div>
  );
}

function formatSource(source: string): string {
  return source
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
