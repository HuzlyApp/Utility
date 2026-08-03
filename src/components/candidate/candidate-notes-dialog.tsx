"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { CandidateNotesPanel } from "@/components/candidate/candidate-notes-panel";
import type { CandidateNoteRow } from "@/lib/dal/types";
import type { CrmActorRole } from "@/lib/candidate-crm";

export function CandidateNotesDialog({
  candidateId,
  candidateName,
  currentUserId,
  currentUserRole,
  onClose,
  onNotesChange,
}: {
  candidateId: string;
  candidateName: string;
  currentUserId: string;
  currentUserRole: CrmActorRole;
  onClose: () => void;
  onNotesChange?: (count: number) => void;
}) {
  const [notes, setNotes] = useState<CandidateNoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/candidates/${candidateId}/notes`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.success) {
          setError(data.error ?? "Could not load notes.");
          setNotes([]);
          return;
        }
        setNotes(data.notes as CandidateNoteRow[]);
      } catch {
        if (active) {
          setError("Could not load notes.");
          setNotes([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [candidateId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-notes-dialog-title"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3
              id="candidate-notes-dialog-title"
              className="text-base font-semibold text-slate-900"
            >
              Notes
            </h3>
            <p className="text-xs text-slate-500">{candidateName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {notes == null ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading notes…</p>
          ) : error ? (
            <p className="py-6 text-center text-sm text-red-600">{error}</p>
          ) : (
            <CandidateNotesPanel
              candidateId={candidateId}
              initialNotes={notes}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              framed={false}
              onNotesChange={onNotesChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
