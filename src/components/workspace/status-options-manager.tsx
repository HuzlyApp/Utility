"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  TextInput,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { CandidateStatusRow } from "@/lib/dal/types";

const GRID_COLS =
  "grid-cols-1 md:grid-cols-[minmax(0,1fr)_56px_110px_110px_88px_88px_72px]";

export function StatusOptionsManager({
  initialStatuses,
}: {
  initialStatuses: CandidateStatusRow[];
}) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CandidateStatusRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => a.display_order - b.display_order),
    [statuses]
  );
  const activeCount = useMemo(
    () => statuses.filter((s) => s.is_active).length,
    [statuses]
  );
  const anyBusy = adding || deleting || busyId != null;

  async function addStatus() {
    if (!name.trim()) {
      toast("Status name is required.", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/settings/statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not add status.", "error");
        return;
      }
      setName("");
      setColor("#64748b");
      setStatuses((prev) => [...prev, data.status]);
      toast("Status added.", "success");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function patchStatus(
    statusId: string,
    body: Record<string, unknown>,
    successMessage: string
  ) {
    setBusyId(statusId);
    try {
      const res = await fetch("/api/settings/statuses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId, ...body }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not update status.", "error");
        return;
      }
      toast(successMessage, "success");
      setStatuses((prev) =>
        prev.map((s) => {
          if (s.id !== statusId) {
            if (body.isDefault && data.status?.is_default) {
              return { ...s, is_default: false };
            }
            return s;
          }
          return data.status ?? s;
        })
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function move(statusId: string, direction: -1 | 1) {
    const ids = sorted.map((s) => s.id);
    const idx = ids.indexOf(statusId);
    const swap = idx + direction;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    const next = [...ids];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBusyId(statusId);
    try {
      const res = await fetch("/api/settings/statuses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not reorder statuses.", "error");
        return;
      }
      setStatuses(data.statuses);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/statuses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not delete status.", "error");
        return;
      }
      setStatuses((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Status deleted successfully.", "success");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Candidate Status Options"
        description="Manage recruiting stages for this workspace. Deactivate instead of deleting statuses that have been used."
      />
      <CardBody className="space-y-4">
        {/* Add status row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              New status name
            </label>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Background Check"
              disabled={anyBusy}
              className="h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addStatus();
                }
              }}
            />
          </div>
          <div className="shrink-0">
            <label className="mb-1 block text-xs font-medium text-slate-500">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={anyBusy}
              className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
              aria-label="New status color"
              title="Choose status color"
            />
          </div>
          <div className="shrink-0 sm:pt-5">
            <Button
              className="h-10 w-full sm:w-auto"
              onClick={addStatus}
              disabled={anyBusy || !name.trim()}
            >
              {adding ? "Adding…" : "Add status"}
            </Button>
          </div>
        </div>

        {/* Column headers (desktop) */}
        <div
          className={cn(
            "hidden rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid md:items-center md:gap-2",
            GRID_COLS
          )}
        >
          <span>Status</span>
          <span className="text-center">Color</span>
          <span className="text-center">Default</span>
          <span className="text-center">Visibility</span>
          <span className="text-center">State</span>
          <span className="text-center">Order</span>
          <span className="text-center">Actions</span>
        </div>

        <ul className="overflow-hidden rounded-lg border border-slate-200 md:rounded-t-none">
          {sorted.map((status, index) => {
            const rowBusy = anyBusy;
            const isRowBusy = busyId === status.id;
            return (
              <li
                key={status.id}
                className={cn(
                  "border-b border-slate-100 px-3 py-3 last:border-b-0",
                  !status.is_active && "bg-slate-50/80",
                  "grid gap-3 md:items-center md:gap-2",
                  GRID_COLS
                )}
              >
                {/* Status name */}
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/5"
                    style={{ backgroundColor: status.color || "#94a3b8" }}
                    aria-hidden
                  />
                  <input
                    className={cn(
                      "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-sm font-medium text-slate-800",
                      "hover:border-slate-300 focus:border-slate-400 focus:outline-none",
                      !status.is_active && "text-slate-500"
                    )}
                    defaultValue={status.name}
                    key={`${status.id}-${status.name}`}
                    disabled={rowBusy}
                    title="Edit status name"
                    aria-label={`Status name for ${status.name}`}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (!next || next === status.name) {
                        e.target.value = status.name;
                        return;
                      }
                      void patchStatus(status.id, { name: next }, "Status renamed.");
                    }}
                  />
                </div>

                {/* Color */}
                <div className="flex items-center md:justify-center">
                  <span className="mr-2 text-xs text-slate-500 md:hidden">Color</span>
                  <input
                    type="color"
                    value={status.color || "#94a3b8"}
                    disabled={rowBusy}
                    onChange={(e) =>
                      void patchStatus(status.id, { color: e.target.value }, "Color updated.")
                    }
                    className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
                    aria-label={`Color for ${status.name}`}
                    title={`Change color for ${status.name}`}
                  />
                </div>

                {/* Default */}
                <div className="flex items-center md:justify-center">
                  {status.is_default ? (
                    <span
                      className="inline-flex h-8 min-w-[96px] items-center justify-center rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700"
                      title="This is the default status for new candidates"
                    >
                      Default
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 min-w-[96px]"
                      disabled={rowBusy || !status.is_active}
                      title={`Set ${status.name} as default`}
                      aria-label={`Set ${status.name} as default status`}
                      onClick={() =>
                        void patchStatus(status.id, { isDefault: true }, "Default status set.")
                      }
                    >
                      {isRowBusy ? "…" : "Set default"}
                    </Button>
                  )}
                </div>

                {/* Visibility */}
                <div className="flex items-center md:justify-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 min-w-[96px]"
                    disabled={
                      rowBusy ||
                      (status.is_active && activeCount <= 1) ||
                      (status.is_active && status.is_default)
                    }
                    title={
                      status.is_active
                        ? status.is_default
                          ? "Set another default before deactivating"
                          : `Deactivate ${status.name}`
                        : `Activate ${status.name}`
                    }
                    aria-label={
                      status.is_active
                        ? `Deactivate ${status.name} status`
                        : `Activate ${status.name} status`
                    }
                    onClick={() =>
                      void patchStatus(
                        status.id,
                        { isActive: !status.is_active },
                        status.is_active ? "Status deactivated." : "Status reactivated."
                      )
                    }
                  >
                    {isRowBusy
                      ? "…"
                      : status.is_active
                        ? "Deactivate"
                        : "Activate"}
                  </Button>
                </div>

                {/* State badge — reserved column so rows don't shift */}
                <div className="flex items-center md:justify-center">
                  {status.is_active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="amber">Inactive</Badge>
                  )}
                </div>

                {/* Order */}
                <div className="flex items-center gap-1 md:justify-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 shrink-0 px-0"
                    disabled={rowBusy || index === 0}
                    onClick={() => void move(status.id, -1)}
                    aria-label={`Move ${status.name} up`}
                    title="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 shrink-0 px-0"
                    disabled={rowBusy || index === sorted.length - 1}
                    onClick={() => void move(status.id, 1)}
                    aria-label={`Move ${status.name} down`}
                    title="Move down"
                  >
                    ↓
                  </Button>
                </div>

                {/* Delete */}
                <div className="flex items-center md:justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 shrink-0 border-red-300 px-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={rowBusy}
                    onClick={() => setDeleteTarget(status)}
                    aria-label={`Delete ${status.name} status`}
                    title={`Delete ${status.name}`}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </li>
            );
          })}
          {sorted.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">
              No statuses yet. Add one above.
            </li>
          )}
        </ul>
      </CardBody>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !deleting) setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-status-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 id="delete-status-title" className="text-base font-semibold text-slate-900">
                Delete candidate status?
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Are you sure you want to delete &ldquo;{deleteTarget.name}&rdquo;? This action
                cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "Deleting…" : "Delete status"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.22-2.365.418a.75.75 0 10.43 1.442l.04-.012A19.6 19.6 0 015.25 5.5h9.5c.172.0.3.01.735.02l.04.012a.75.75 0 00.43-1.442A17.6 17.6 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.784 0 1.532.065 2.25.19V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.44A14.7 14.7 0 0110 4zM6.5 7.75a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0v-6.5a.75.75 0 01.75-.75zm3.5 0a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0v-6.5A.75.75 0 0110 7.75zm4.25.75a.75.75 0 00-1.5 0v6.5a.75.75 0 001.5 0v-6.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
