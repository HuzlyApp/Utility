"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

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
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const label = jobTitle?.trim() || "this job";
    const candNote =
      candidateCount > 0
        ? ` This permanently deletes ${candidateCount} candidate${candidateCount === 1 ? "" : "s"} that only belong to this job (shared candidates are detached).`
        : "";
    if (
      !confirm(
        `Delete ${label}?${candNote}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
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
      toast(parts.join(" "), "success");
      if (redirectToDashboard) {
        router.push("/dashboard");
        router.refresh();
      } else {
        router.refresh();
      }
    } catch {
      toast("Could not delete job.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className={
        className ??
        "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      }
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
