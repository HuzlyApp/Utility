"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader, Button } from "@/components/ui/primitives";
import { UserIcon } from "@/components/ui/icons";
import type { MatchCategory } from "@/lib/types";

const SCORE_COLOR: Record<MatchCategory, string> = {
  STRONG_MATCH: "text-green-700",
  GOOD_MATCH: "text-emerald-700",
  POSSIBLE_MATCH: "text-amber-700",
  WEAK_MATCH: "text-orange-700",
  NOT_A_MATCH: "text-rose-700",
  NOT_CURRENTLY_SUBMITTABLE: "text-red-700",
  NEEDS_MORE_INFORMATION: "text-blue-700",
};

export interface RankedCandidate {
  name: string;
  score: number;
  category: MatchCategory;
}

// Collapsible candidate list for the job workspace (spec §16). One job can hold
// multiple candidates; the recruiter switches between them without re-uploading
// the job description.
export function CandidateRankingPanel({
  candidates,
  activeIndex,
  onSelect,
  onAddCandidate,
}: {
  candidates: RankedCandidate[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAddCandidate: () => void;
}) {
  const ranked = candidates
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.score - a.score);

  return (
    <Card>
      <CardHeader
        title="Candidates"
        description={`${candidates.length} for this job`}
      />
      <CardBody className="space-y-1.5">
        {ranked.map((c, rank) => (
          <button
            key={c.i}
            onClick={() => onSelect(c.i)}
            aria-current={c.i === activeIndex}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
              c.i === activeIndex
                ? "border-brand-300 bg-brand-50"
                : "border-transparent hover:bg-slate-50"
            )}
          >
            <span className="w-4 flex-none text-sm font-semibold text-slate-400">
              {rank + 1}
            </span>
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <UserIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
              {c.name || `Candidate ${c.i + 1}`}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                SCORE_COLOR[c.category]
              )}
            >
              {c.score}%
            </span>
          </button>
        ))}
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 w-full"
          onClick={onAddCandidate}
        >
          <UserIcon className="h-4 w-4" />
          Add Another Candidate
        </Button>
      </CardBody>
    </Card>
  );
}
