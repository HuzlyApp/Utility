"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";

type Props = {
  workspaceId: string;
  jobTitle?: string | null;
  candidateCount?: number;
  /** When true, navigate to dashboard after a successful delete. */
  redirectToDashboard?: boolean;
  className?: string;
};

export function DeleteJobButton({
  workspaceId,
  jobTitle,
  candidateCount = 0,
  redirectToDashboard = false,
  className,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = jobTitle?.trim() || "this job";
  const candNote =
    candidateCount > 0
      ? ` This permanently deletes ${candidateCount} candidate${candidateCount === 1 ? "" : "s"} that only belong to this job (shared candidates are detached).`
      : " Shared candidates attached to other jobs will be detached, not deleted.";

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Delete failed");
      }
      const deleted = Number(data.candidatesDeleted ?? 0);
      const detached = Number(data.candidatesDetached ?? 0);
      const parts = ["Job deleted."];
      if (deleted > 0) parts.push(`${deleted} candidate${deleted === 1 ? "" : "s"} removed.`);
      if (detached > 0) {
        parts.push(
          `${detached} shared candidate${detached === 1 ? "" : "s"} detached.`
        );
      }
      setOpen(false);
      toast(parts.join(" "), "success");
      if (redirectToDashboard) {
        router.push("/dashboard");
        router.refresh();
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not delete this job. Please try again.");
      toast("Could not delete job.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setError(null);
          setOpen(true);
        }}
        disabled={busy}
        className={
          className ??
          "inline-flex h-9 items-center rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        }
      >
        Delete
      </button>

      <ConfirmModal
        isOpen={open}
        title={`Delete ${label}?`}
        description={
          <>
            This will permanently delete the job workspace and its ranking data.
            {candNote} This action cannot be undone.
          </>
        }
        confirmLabel="Delete job"
        confirmLoadingLabel="Deleting…"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={busy}
        error={error}
        onCancel={() => {
          if (!busy) {
            setOpen(false);
            setError(null);
          }
        }}
        onConfirm={onConfirm}
      />
    </>
  );
}
