"use client";

import { useState } from "react";
import { Button, Card, CardBody, CardHeader, TextArea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import type { CandidateNoteRow } from "@/lib/dal/types";
import { canEditNote, type CrmActorRole } from "@/lib/candidate-crm";

export function CandidateNotesPanel({
  candidateId,
  initialNotes,
  currentUserId,
  currentUserRole,
}: {
  candidateId: string;
  initialNotes: CandidateNoteRow[];
  currentUserId: string;
  currentUserRole: CrmActorRole;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CandidateNoteRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { toast } = useToast();

  async function addNote() {
    if (!draft.trim()) {
      toast("Enter a note first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: draft }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not add note.", "error");
        return;
      }
      setNotes((prev) => [data.note, ...prev]);
      setDraft("");
      toast("Note added.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(noteId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText: editText }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not update note.", "error");
        return;
      }
      setNotes((prev) => prev.map((n) => (n.id === noteId ? data.note : n)));
      setEditingId(null);
      toast("Note updated.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteNote() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error ?? "Could not delete note.");
        toast(data.error ?? "Could not delete note.", "error");
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Note deleted.", "success");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Notes" description="Visible to recruiters in this workspace." />
      <CardBody className="space-y-3">
        <TextArea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
        />
        <Button size="sm" disabled={busy || !draft.trim()} onClick={addNote}>
          Add note
        </Button>

        <ul className="space-y-3">
          {notes.length === 0 && (
            <li className="text-sm text-slate-400">No notes yet.</li>
          )}
          {notes.map((note) => {
            const editable = canEditNote({
              authorUserId: note.author_user_id,
              actorUserId: currentUserId,
              actorRole: currentUserRole,
            });
            const edited =
              new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 1000;
            return (
              <li key={note.id} className="rounded-lg border border-slate-200 p-3">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <TextArea
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => saveEdit(note.id)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{note.note_text}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Added by: {note.author_name || "System migration"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Date: {formatTimestamp(note.created_at)}
                      {edited ? ` · Edited: ${formatTimestamp(note.updated_at)}` : ""}
                    </p>
                    {editable && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || deleting}
                          onClick={() => {
                            setEditingId(note.id);
                            setEditText(note.note_text);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || deleting}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(note);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete note?"
        description="This note will be removed from the candidate profile. The deletion may remain visible in the audit history."
        confirmLabel="Delete note"
        confirmLoadingLabel="Deleting…"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={confirmDeleteNote}
      />
    </Card>
  );
}
