"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge, Card, CardBody, CardHeader, TextInput } from "@/components/ui/primitives";
import {
  ChevronDownIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { EvidenceBlock } from "./evidence-block";
import { requirementVisual } from "./status";
import type { AiRequirement, AiScreeningQuestion } from "@/lib/schema";

export interface VerificationEntry {
  verified: boolean;
  note: string;
}
export type VerificationState = Record<string, VerificationEntry>;

type FilterKey =
  | "all"
  | "mandatory"
  | "preferred"
  | "confirmed"
  | "verify"
  | "blocking";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mandatory", label: "Mandatory" },
  { key: "preferred", label: "Preferred" },
  { key: "confirmed", label: "Confirmed" },
  { key: "verify", label: "Needs Verification" },
  { key: "blocking", label: "Blocking" },
];

export function QualificationTable({
  requirements,
  questions,
  verifications,
  onToggleVerified,
  onNote,
}: {
  requirements: AiRequirement[];
  questions: AiScreeningQuestion[];
  verifications: VerificationState;
  onToggleVerified: (requirement: string) => void;
  onNote: (requirement: string, note: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return requirements.filter((r) => {
      if (query && !r.requirement.toLowerCase().includes(query.toLowerCase()))
        return false;
      switch (filter) {
        case "mandatory":
          return r.requirement_type === "MANDATORY";
        case "preferred":
          return r.requirement_type === "PREFERRED";
        case "confirmed":
          return r.requirement_outcome === "MET";
        case "verify":
          return r.requirement_outcome === "VERIFY";
        case "blocking":
          return (
            r.requirement_outcome === "NOT_MET" ||
            r.requirement_outcome === "CONFLICT"
          );
        default:
          return true;
      }
    });
  }, [requirements, filter, query]);

  function relatedQuestion(req: string): string | undefined {
    return questions.find((q) => q.related_requirement === req)?.question;
  }

  return (
    <Card>
      <CardHeader
        title="Qualification Checklist"
        description="Every requirement with its evidence and submission impact."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter requirements">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.key
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-56">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search requirements…"
              className="pl-8"
              aria-label="Search requirements"
            />
          </div>
        </div>

        {/* Desktop column header */}
        <div className="hidden grid-cols-[1fr,110px,130px] gap-3 border-b border-slate-100 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid">
          <span>Requirement</span>
          <span>Type</span>
          <span>Status</span>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.map((req, idx) => {
            const key = `${req.requirement}-${idx}`;
            const isOpen = openKey === key;
            const v = verifications[req.requirement];
            const visual = requirementVisual(req.status, req.requirement_outcome);
            const question = relatedQuestion(req.requirement);
            return (
              <div key={key} className="py-1">
                <button
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-1 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50 md:grid-cols-[1fr,110px,130px]"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <ChevronDownIcon
                      className={cn(
                        "h-4 w-4 flex-none text-slate-400 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                    {req.requirement}
                    {v?.verified && (
                      <Badge tone="green" className="ml-1">
                        <ShieldIcon className="h-3 w-3" /> Verified
                      </Badge>
                    )}
                  </span>
                  <span className="pl-6 md:pl-0">
                    <Badge tone={req.requirement_type === "MANDATORY" ? "blue" : "slate"}>
                      {req.requirement_type === "MANDATORY" ? "Mandatory" : "Preferred"}
                    </Badge>
                  </span>
                  <span className="pl-6 md:pl-0">
                    <Badge tone={visual.tone}>{visual.label}</Badge>
                  </span>
                </button>

                {isOpen && (
                  <div className="animate-fade-in space-y-3 px-2 pb-3 pt-1 md:pl-8">
                    <EvidenceBlock
                      evidence={req.candidate_evidence}
                      source={req.evidence_source}
                      confidence={req.confidence}
                    />
                    <p className="text-sm text-slate-700">
                      <span className="font-medium text-slate-500">
                        Submission impact:{" "}
                      </span>
                      {req.impact || "—"}
                      {req.verification_required && (
                        <span className="ml-1 text-amber-700">
                          (verification required)
                        </span>
                      )}
                    </p>
                    {question && (
                      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <span className="font-medium">Suggested question: </span>
                        {question}
                      </p>
                    )}
                    <div className="rounded-lg border border-slate-200 p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={v?.verified ?? false}
                          onChange={() => onToggleVerified(req.requirement)}
                        />
                        Mark this qualification as verified
                      </label>
                      {v?.verified && (
                        <TextInput
                          className="mt-2"
                          placeholder="Verification note (what did you confirm?)"
                          value={v.note}
                          onChange={(e) => onNote(req.requirement, e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              No requirements match this filter.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
