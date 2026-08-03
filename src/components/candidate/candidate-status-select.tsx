"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { patchCandidateStatus, formatTimestamp } from "@/lib/client/candidate-crm";

export interface StatusOption {
  id: string;
  name: string;
  color: string | null;
  is_active?: boolean;
}

export function CandidateStatusSelect({
  candidateId,
  statuses,
  value,
  statusName,
  statusColor,
  updatedByName,
  updatedAt,
  showAttribution = true,
  className,
  onChanged,
}: {
  candidateId: string;
  statuses: StatusOption[];
  value: string | null;
  statusName?: string | null;
  statusColor?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  showAttribution?: boolean;
  className?: string;
  onChanged?: (next: {
    statusId: string;
    statusName: string | null;
    changedAt: string;
    changedByName: string | null;
  }) => void;
}) {
  const [statusId, setStatusId] = useState(value);
  const [saving, setSaving] = useState(false);
  const [localName, setLocalName] = useState(statusName ?? null);
  const [localColor, setLocalColor] = useState(statusColor ?? null);
  const [localBy, setLocalBy] = useState(updatedByName ?? null);
  const [localAt, setLocalAt] = useState(updatedAt ?? null);
  const { toast } = useToast();

  async function onChange(nextId: string) {
    if (!nextId || nextId === statusId) return;
    const previous = statusId;
    setStatusId(nextId);
    setSaving(true);
    try {
      const result = await patchCandidateStatus(candidateId, nextId);
      const opt = statuses.find((s) => s.id === nextId);
      setLocalName(result.newStatusName ?? opt?.name ?? null);
      setLocalColor(opt?.color ?? null);
      if (result.changed) {
        setLocalBy(result.changedByName);
        setLocalAt(result.changedAt);
        toast("Status updated.", "success");
        onChanged?.({
          statusId: nextId,
          statusName: result.newStatusName,
          changedAt: result.changedAt,
          changedByName: result.changedByName,
        });
      }
    } catch (err) {
      setStatusId(previous);
      toast(err instanceof Error ? err.message : "Could not update status.", "error");
    } finally {
      setSaving(false);
    }
  }

  const activeStatuses = statuses.filter((s) => s.is_active !== false);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: localColor || "#94a3b8" }}
          aria-hidden
        />
        <select
          className="h-8 max-w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 disabled:opacity-60"
          value={statusId ?? ""}
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            void onChange(e.target.value);
          }}
          aria-label="Candidate status"
        >
          {!statusId && <option value="">Select status</option>}
          {activeStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {statusId &&
            !activeStatuses.some((s) => s.id === statusId) &&
            localName && (
              <option value={statusId}>{localName} (inactive)</option>
            )}
        </select>
      </div>
      {showAttribution && (localBy || localAt) && (
        <p className="text-[11px] text-slate-500">
          Status updated by: {localBy || "—"}
          {localAt ? ` · ${formatTimestamp(localAt)}` : ""}
        </p>
      )}
    </div>
  );
}
