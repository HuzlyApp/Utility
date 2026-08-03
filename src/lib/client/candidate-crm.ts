"use client";

export async function patchCandidateStatus(
  candidateId: string,
  statusId: string
): Promise<{
  changed: boolean;
  statusId: string;
  previousStatusName: string | null;
  newStatusName: string | null;
  changedAt: string;
  changedByName: string | null;
}> {
  const res = await fetch(`/api/candidates/${candidateId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statusId }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Could not update status.");
  }
  return data;
}

export async function patchCandidateAssignment(
  candidateId: string,
  assignedRecruiterId: string | null
): Promise<{
  changed: boolean;
  previousRecruiterName: string | null;
  newRecruiterName: string | null;
  assignedRecruiterId: string | null;
}> {
  const res = await fetch(`/api/candidates/${candidateId}/assignment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedRecruiterId }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? "Could not update assignment.");
  }
  return data;
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
