"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import {
  CandidateStatusModal,
  type StatusModalTab,
} from "@/components/candidate/candidate-status-modal";
import { ClockIcon } from "@/components/ui/icons";

export interface StatusOption {
  id: string;
  name: string;
  color: string | null;
  is_active?: boolean;
}

export function CandidateStatusSelect({
  candidateId,
  candidateName,
  statuses,
  value,
  statusName,
  statusColor,
  updatedByName,
  updatedAt,
  showAttribution = true,
  showHistoryAction = true,
  fullWidth = false,
  className,
  onChanged,
}: {
  candidateId: string;
  candidateName?: string | null;
  statuses: StatusOption[];
  value: string | null;
  statusName?: string | null;
  statusColor?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  showAttribution?: boolean;
  /** Show View History control next to the status button. */
  showHistoryAction?: boolean;
  fullWidth?: boolean;
  className?: string;
  onChanged?: (next: {
    statusId: string;
    statusName: string | null;
    changedAt: string;
    changedByName: string | null;
  }) => void;
}) {
  const [statusId, setStatusId] = useState(value);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<StatusModalTab>("update");
  const [localName, setLocalName] = useState(statusName ?? null);
  const [localColor, setLocalColor] = useState(statusColor ?? null);
  const [localBy, setLocalBy] = useState(updatedByName ?? null);
  const [localAt, setLocalAt] = useState(updatedAt ?? null);
  const { toast } = useToast();

  useEffect(() => {
    if (modalOpen) return;
    setStatusId(value);
    setLocalName(statusName ?? null);
    setLocalColor(statusColor ?? null);
    setLocalBy(updatedByName ?? null);
    setLocalAt(updatedAt ?? null);
  }, [value, statusName, statusColor, updatedByName, updatedAt, modalOpen]);

  function openModal(tab: StatusModalTab) {
    setModalTab(tab);
    setModalOpen(true);
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className={cn("flex items-center gap-1.5", fullWidth && "w-full")}>
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: localColor || "#94a3b8" }}
          aria-hidden
        />
        <button
          type="button"
          className={cn(
            "max-w-full rounded-md border border-slate-300 bg-white px-2 text-left text-sm text-slate-800 hover:bg-slate-50",
            fullWidth ? "h-9 min-w-0 flex-1" : "h-8 min-w-[9rem]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            openModal("update");
          }}
          aria-label="Update candidate status"
        >
          {localName || "Select status"}
        </button>
        {showHistoryAction ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            title="View status history"
            aria-label="View status history"
            onClick={(e) => {
              e.stopPropagation();
              openModal("history");
            }}
          >
            <ClockIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {showAttribution && (localBy || localAt) && (
        <p className="break-words text-[11px] text-slate-500">
          Status updated by: {localBy || "—"}
          {localAt ? ` · ${formatTimestamp(localAt)}` : ""}
        </p>
      )}

      <CandidateStatusModal
        isOpen={modalOpen}
        candidateId={candidateId}
        candidateName={candidateName}
        statuses={statuses}
        currentStatusId={statusId}
        currentStatusName={localName}
        currentStatusColor={localColor}
        initialTab={modalTab}
        onCancel={() => setModalOpen(false)}
        onSuccess={(result) => {
          const opt = statuses.find((s) => s.id === result.statusId);
          setStatusId(result.statusId);
          setLocalName(result.statusName ?? opt?.name ?? null);
          setLocalColor(opt?.color ?? null);
          setLocalBy(result.changedByName);
          setLocalAt(result.changedAt);
          toast("Status updated.", "success");
          onChanged?.(result);
        }}
      />
    </div>
  );
}
