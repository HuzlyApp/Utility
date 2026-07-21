"use client";

import React from "react";
import { Button } from "@/components/ui/primitives";
import {
  ClipboardIcon,
  UserIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";

export interface CandidateNav {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function CandidateResultHeader({
  candidateName,
  jobTitle,
  jobId,
  mspName,
  location,
  createdAt,
  onStartNew,
  onAddCandidate,
  nav,
}: {
  candidateName: string;
  jobTitle: string;
  jobId: string;
  mspName: string;
  location: string;
  createdAt: string;
  onStartNew: () => void;
  onAddCandidate: () => void;
  nav?: CandidateNav;
}) {
  const subtitleParts = [
    jobTitle || "Untitled role",
    jobId ? `Job ID ${jobId}` : null,
  ].filter(Boolean);
  const orgParts = [mspName, location].filter(Boolean);
  const when = safeDate(createdAt);

  return (
    <div className="space-y-3">
      {/* Breadcrumb / workspace path */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-xs text-slate-400"
      >
        <span>Job Workspace</span>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span>{jobTitle || "Role"}</span>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="font-medium text-slate-600">
          {candidateName || "Candidate"}
        </span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <UserIcon />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Candidate Match Assessment
            </p>
            <h1 className="text-xl font-semibold leading-tight text-slate-900 sm:text-2xl">
              {candidateName || "Candidate"}
            </h1>
            <p className="text-sm text-slate-500">{subtitleParts.join(" — ")}</p>
            {orgParts.length > 0 && (
              <p className="text-sm text-slate-400">{orgParts.join(" · ")}</p>
            )}
            {when && (
              <p className="mt-0.5 text-xs text-slate-400">Analyzed {when}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {nav && nav.total > 1 && (
            <div className="mr-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
              <button
                onClick={nav.onPrev}
                aria-label="Previous candidate"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <ChevronDownIcon className="h-4 w-4 rotate-90" />
              </button>
              <span className="px-1 text-xs font-medium text-slate-600">
                Candidate {nav.index + 1} of {nav.total}
              </span>
              <button
                onClick={nav.onNext}
                aria-label="Next candidate"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <ChevronDownIcon className="h-4 w-4 -rotate-90" />
              </button>
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={onAddCandidate}>
            <UserIcon className="h-4 w-4" />
            Add Candidate
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartNew}>
            <ClipboardIcon className="h-4 w-4" />
            Start New Analysis
          </Button>
        </div>
      </div>
    </div>
  );
}

function safeDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
