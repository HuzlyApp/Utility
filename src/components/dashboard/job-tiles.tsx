"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
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

export function JobTiles({
  workspaces,
  emptyMessage,
  emptyAction,
}: {
  workspaces: WorkspaceSummary[];
  emptyMessage?: string;
  emptyAction?: { label: string; href: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    workspace: WorkspaceSummary;
    next: "ACTIVE" | "ARCHIVED";
  } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const restoring = statusTarget?.next === "ACTIVE";

  async function confirmStatusChange() {
    if (!statusTarget) return;
    const { workspace, next } = statusTarget;
    setBusy(workspace.id);
    setStatusError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_status: next }),
      });
      if (!res.ok) throw new Error();
      setStatusTarget(null);
      toast(
        next === "ARCHIVED"
          ? "Workspace archived."
          : "Job restored to active jobs.",
        "success"
      );
      router.refresh();
    } catch {
      setStatusError(
        next === "ARCHIVED"
          ? "Could not archive this workspace. Please try again."
          : "Could not restore this job. Please try again."
      );
      toast(
        next === "ARCHIVED"
          ? "Could not archive workspace."
          : "Could not restore job.",
        "error"
      );
    } finally {
      setBusy(null);
    }
  }

  if (workspaces.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-sm text-slate-500">
            {emptyMessage || "No job workspaces yet."}
          </p>
          {emptyAction ? (
            <Link
              href={emptyAction.href}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {emptyAction.label}
            </Link>
          ) : !emptyMessage ? (
            <Link
              href="/jobs/new"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + Create Job Workspace
            </Link>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <>
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
                {archived ? (
                  <button
                    type="button"
                    onClick={(e) =>
                      isolateCardAction(e, () => {
                        setStatusError(null);
                        setStatusTarget({ workspace: w, next: "ACTIVE" });
                      })
                    }
                    disabled={busy === w.id}
                    className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {busy === w.id ? "Unarchiving…" : "Unarchive"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) =>
                      isolateCardAction(e, () => {
                        setStatusError(null);
                        setStatusTarget({ workspace: w, next: "ARCHIVED" });
                      })
                    }
                    disabled={busy === w.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {busy === w.id ? "Archiving…" : "Archive"}
                  </button>
                )}
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

      <ConfirmModal
        isOpen={Boolean(statusTarget)}
        title={restoring ? "Unarchive job workspace?" : "Archive job workspace?"}
        description={
          restoring ? (
            <>
              Restore{" "}
              <span className="font-medium text-slate-800">
                {statusTarget?.workspace.job_title || "this job"}
              </span>{" "}
              to the active jobs list? Candidates, notes, analyses, and other job
              data stay intact.
            </>
          ) : (
            <>
              Archive{" "}
              <span className="font-medium text-slate-800">
                {statusTarget?.workspace.job_title || "this job"}
              </span>
              ? You can restore it later from archived jobs. Candidates and analyses stay
              available.
            </>
          )
        }
        confirmLabel={restoring ? "Unarchive job" : "Archive job"}
        confirmLoadingLabel={restoring ? "Unarchiving…" : "Archiving…"}
        cancelLabel="Cancel"
        variant={restoring ? "success" : "warning"}
        isLoading={busy === statusTarget?.workspace.id}
        error={statusError}
        onCancel={() => {
          if (busy) return;
          setStatusTarget(null);
          setStatusError(null);
        }}
        onConfirm={confirmStatusChange}
      />
    </>
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
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {w.workspace_status === "ARCHIVED" ? (
            <Badge tone="slate">Archived</Badge>
          ) : null}
          <Badge tone={w.job_status === "OPEN" ? "green" : "slate"}>
            {w.job_status}
          </Badge>
        </div>
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
