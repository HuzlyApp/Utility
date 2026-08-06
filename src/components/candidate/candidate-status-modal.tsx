"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, TextArea } from "@/components/ui/primitives";
import { XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import {
  formatTimestamp,
  patchCandidateStatus,
} from "@/lib/client/candidate-crm";
import {
  displayOrDash,
  toStatusHistory,
  type StatusHistoryEntry,
} from "@/lib/candidate-crm";
import type { StatusOption } from "@/components/candidate/candidate-status-select";
import type { CandidateActivityRow } from "@/lib/dal/types";
import { displayCandidateName } from "@/lib/resume-name";

export type StatusModalTab = "update" | "history";

export function CandidateStatusModal({
  isOpen,
  candidateId,
  candidateName,
  statuses,
  currentStatusId,
  currentStatusName,
  currentStatusColor,
  initialTab = "update",
  onCancel,
  onSuccess,
}: {
  isOpen: boolean;
  candidateId: string;
  candidateName?: string | null;
  statuses: StatusOption[];
  currentStatusId: string | null;
  currentStatusName: string | null;
  currentStatusColor: string | null;
  initialTab?: StatusModalTab;
  onCancel: () => void;
  onSuccess: (result: {
    statusId: string;
    statusName: string | null;
    changedAt: string;
    changedByName: string | null;
  }) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const submittingRef = useRef(false);

  const [tab, setTab] = useState<StatusModalTab>(initialTab);
  const [newStatusId, setNewStatusId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const activeStatuses = statuses.filter((s) => s.is_active !== false);
  const displayName = displayCandidateName(candidateName);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/activity`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Could not load status history.");
      }
      const activity = (data.activity ?? []) as CandidateActivityRow[];
      setHistory(toStatusHistory(activity));
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Could not load status history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setNewStatusId("");
    setNote("");
    setSaving(false);
    setError(null);
    setSuccessMessage(null);
    submittingRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      if (initialTab === "update") selectRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || tab !== "history") return;
    void loadHistory();
  }, [isOpen, tab, loadHistory]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, saving, onCancel]);

  if (!isOpen) return null;

  const canSubmit =
    Boolean(newStatusId) &&
    newStatusId !== (currentStatusId ?? "") &&
    !saving &&
    !successMessage;

  async function handleSubmit() {
    if (!newStatusId) {
      setError("Select a new status to continue.");
      return;
    }
    if (newStatusId === currentStatusId) {
      setError("Select a different status to update.");
      return;
    }
    if (submittingRef.current || saving) return;
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await patchCandidateStatus(candidateId, newStatusId, note);
      const opt = activeStatuses.find((s) => s.id === newStatusId);
      setSuccessMessage("Status updated successfully.");
      onSuccess({
        statusId: newStatusId,
        statusName: result.newStatusName ?? opt?.name ?? null,
        changedAt: result.changedAt,
        changedByName: result.changedByName,
      });
      setTab("history");
      await loadHistory();
      submittingRef.current = false;
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
      submittingRef.current = false;
      setSaving(false);
    }
  }

  const content = (
    <div
      className="confirm-modal-overlay fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (saving) return;
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        className="confirm-modal-panel flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-slate-900">
              Candidate status
            </h3>
            <p className="mt-1 text-sm text-slate-500">{displayName}</p>
          </div>
          {!saving && (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          className="flex gap-1 border-b border-slate-100 px-5"
          role="tablist"
          aria-label="Status dialog sections"
        >
          {(
            [
              { id: "update" as const, label: "Update Status" },
              { id: "history" as const, label: "Status History" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === item.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "update" ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current status
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-800">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: currentStatusColor || "#94a3b8" }}
                    aria-hidden
                  />
                  {currentStatusName || "—"}
                </div>
              </div>

              <div>
                <label
                  htmlFor="candidate-new-status"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  New status
                </label>
                <select
                  ref={selectRef}
                  id="candidate-new-status"
                  className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 disabled:opacity-60"
                  value={newStatusId}
                  disabled={saving || Boolean(successMessage)}
                  onChange={(e) => {
                    setNewStatusId(e.target.value);
                    setError(null);
                  }}
                >
                  <option value="">Select a status</option>
                  {activeStatuses
                    .filter((s) => s.id !== currentStatusId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="candidate-status-note"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Notes{" "}
                  <span className="font-normal normal-case">(optional)</span>
                </label>
                <TextArea
                  id="candidate-status-note"
                  rows={3}
                  className="mt-1.5"
                  placeholder="Add context for this status change…"
                  value={note}
                  disabled={saving || Boolean(successMessage)}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={4000}
                />
              </div>

              {error ? (
                <p
                  id={errorId}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              {successMessage ? (
                <p
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800"
                  role="status"
                >
                  {successMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {historyLoading ? (
                <p className="text-sm text-slate-500">Loading history…</p>
              ) : historyError ? (
                <p className="text-sm text-red-600" role="alert">
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No status changes have been recorded yet.
                </p>
              ) : (
                <ol className="space-y-3">
                  {history.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {displayOrDash(entry.newStatus)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        From: {displayOrDash(entry.previousStatus)}
                      </p>
                      {entry.note ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                          Note: {entry.note}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-slate-500">
                        Updated by {displayOrDash(entry.updatedBy)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatTimestamp(entry.changedAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {tab === "update" ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-full sm:w-auto"
              disabled={!canSubmit}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden
                  />
                  Updating…
                </span>
              ) : (
                "Update Status"
              )}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onCancel}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
