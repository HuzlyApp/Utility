"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { DeleteJobButton } from "@/components/jobs/delete-job-button";
import { isolateCardAction, jobCardNavigation } from "@/lib/routes";
import type { WorkspaceSummary } from "@/lib/dal/types";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function JobTiles({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function archive(id: string) {
    if (
      !confirm(
        "Archive this job workspace? You can restore it later from archived jobs."
      )
    ) {
      return;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_status: "ARCHIVED" }),
      });
      if (!res.ok) throw new Error();
      toast("Workspace archived.", "success");
      router.refresh();
    } catch {
      toast("Could not archive workspace.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (workspaces.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-sm text-slate-500">No job workspaces yet.</p>
          <Link
            href="/jobs/new"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Create Job Workspace
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {workspaces.map((w) => {
        const archived = w.workspace_status === "ARCHIVED";
        const nav = jobCardNavigation(w.id, { archived });
        const title = w.job_title || "Untitled job";

        return (
          <Card
            key={w.id}
            className={`flex flex-col transition-all duration-150 ${
              nav.canNavigate
                ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                : "opacity-90"
            }`}
          >
            {nav.workspaceHref ? (
              <Link
                href={nav.workspaceHref}
                aria-label={`Open workspace for ${title}`}
                className="block cursor-pointer rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <JobCardBody w={w} title={title} />
              </Link>
            ) : (
              <div aria-disabled="true">
                <JobCardBody w={w} title={title} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 px-5 pb-5 pt-1">
              <Link
                href={nav.actions.openWorkspace}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                onClick={(e) => isolateCardAction(e)}
              >
                Open Workspace
              </Link>
              <Link
                href={nav.actions.addCandidates}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                onClick={(e) => isolateCardAction(e)}
              >
                Add Candidates
              </Link>
              <Link
                href={nav.actions.edit}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                onClick={(e) => isolateCardAction(e)}
              >
                Edit Job
              </Link>
              <button
                type="button"
                onClick={(e) => isolateCardAction(e, () => archive(w.id))}
                disabled={busy === w.id || archived}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {busy === w.id ? "Archiving…" : "Archive"}
              </button>
              <DeleteJobButton
                workspaceId={w.id}
                jobTitle={w.job_title}
                candidateCount={w.candidate_count}
              />
              <span className="ml-auto text-[11px] text-slate-400">
                Updated {timeAgo(w.updated_at)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function JobCardBody({
  w,
  title,
}: {
  w: WorkspaceSummary;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 p-5 pb-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            {w.msp_or_client || "—"}
            {w.job_ref ? ` · Job ID ${w.job_ref}` : ""}
          </p>
        </div>
        <Badge tone={w.job_status === "OPEN" ? "green" : "slate"}>
          {w.job_status}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {w.specialty && <span>{w.specialty}</span>}
        {w.location && <span>{w.location}</span>}
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-2 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-900">{w.candidate_count}</p>
          <p className="text-[10px] uppercase text-slate-400">Cands</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{w.analyzed_count}</p>
          <p className="text-[10px] uppercase text-slate-400">Analyzed</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-green-600">{w.strong_matches}</p>
          <p className="text-[10px] uppercase text-slate-400">Strong</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-600">{w.ready_to_submit}</p>
          <p className="text-[10px] uppercase text-slate-400">Ready</p>
        </div>
      </div>
    </div>
  );
}
