"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { patchCandidateAssignment } from "@/lib/client/candidate-crm";

export interface AssigneeOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export function CandidateAssignmentSelect({
  candidateId,
  recruiters,
  value,
  onChanged,
}: {
  candidateId: string;
  recruiters: AssigneeOption[];
  value: string | null;
  onChanged?: (next: string | null, name: string | null) => void;
}) {
  const [assignedId, setAssignedId] = useState(value);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function onChange(next: string) {
    const nextId = next === "" ? null : next;
    const previous = assignedId;
    setAssignedId(nextId);
    setSaving(true);
    try {
      const result = await patchCandidateAssignment(candidateId, nextId);
      if (result.changed) {
        toast("Assignment updated.", "success");
        onChanged?.(nextId, result.newRecruiterName);
      }
    } catch (err) {
      setAssignedId(previous);
      toast(err instanceof Error ? err.message : "Could not update assignment.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
      value={assignedId ?? ""}
      disabled={saving}
      onChange={(e) => void onChange(e.target.value)}
      aria-label="Assigned recruiter"
    >
      <option value="">Unassigned</option>
      {recruiters.map((r) => (
        <option key={r.user_id} value={r.user_id}>
          {r.full_name || r.email || r.user_id}
        </option>
      ))}
    </select>
  );
}
