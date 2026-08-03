import "server-only";
import { getSql } from "./client";
import { AuthError, type AppUser } from "@/lib/auth/session";
import { canManageTenant } from "@/lib/auth/rbac";
import { audit } from "./audit";
import { logCandidateActivity } from "./activity";
import type { CandidateNoteRow } from "./types";

export type CandidateNote = CandidateNoteRow;

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

async function assertCandidateInTenant(
  tenantId: string,
  candidateId: string
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM candidates WHERE id = ${candidateId} AND tenant_id = ${tenantId}
  `) as { id: string }[];
  return rows.length > 0;
}

function canManageNote(user: AppUser, note: CandidateNote): boolean {
  if (note.author_user_id === user.id) return true;
  return canManageTenant(user.role);
}

export async function listCandidateNotes(
  user: AppUser,
  candidateId: string,
  opts?: { includeDeleted?: boolean }
): Promise<CandidateNote[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const includeDeleted = opts?.includeDeleted ?? false;
  const rows = (await sql`
    SELECT
      n.id, n.tenant_id, n.candidate_id, n.author_user_id,
      COALESCE(up.full_name, up.email) AS author_name,
      n.note_text, n.created_at, n.updated_at, n.deleted_at, n.deleted_by_user_id
    FROM candidate_notes n
    JOIN candidates c ON c.id = n.candidate_id AND c.tenant_id = n.tenant_id
    LEFT JOIN user_profiles up ON up.user_id = n.author_user_id
    WHERE n.candidate_id = ${candidateId}
      AND n.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
      AND (${includeDeleted} OR n.deleted_at IS NULL)
    ORDER BY n.created_at DESC
  `) as CandidateNote[];
  return rows;
}

export async function createCandidateNote(
  user: AppUser,
  candidateId: string,
  noteText: string
): Promise<CandidateNote> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const text = noteText.trim();
  if (!text) throw new AuthError("Note text is required.", 400);
  if (!(await assertCandidateInTenant(tenantId, candidateId))) {
    throw new AuthError("Candidate not found.", 404);
  }

  const rows = (await sql`
    INSERT INTO candidate_notes (
      tenant_id, candidate_id, author_user_id, note_text
    ) VALUES (
      ${tenantId}, ${candidateId}, ${user.id}, ${text}
    )
    RETURNING id, tenant_id, candidate_id, author_user_id, note_text,
              created_at, updated_at, deleted_at, deleted_by_user_id
  `) as Array<Omit<CandidateNote, "author_name">>;

  await sql`
    UPDATE candidates
    SET updated_by_user_id = ${user.id}, updated_at = now()
    WHERE id = ${candidateId} AND tenant_id = ${tenantId}
  `;

  await logCandidateActivity({
    tenantId,
    candidateId,
    performedByUserId: user.id,
    actionType: "NOTE_ADDED",
    newValue: text.slice(0, 200),
    noteId: rows[0].id,
    actorRole: user.role,
    requestId: `note-add:${rows[0].id}`,
  });
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate_note",
    entityId: rows[0].id,
    action: "NOTE_ADDED",
    newValue: { candidate_id: candidateId },
  });

  return {
    ...rows[0],
    author_name: user.name,
  };
}

export async function updateCandidateNote(
  user: AppUser,
  noteId: string,
  noteText: string
): Promise<CandidateNote | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const text = noteText.trim();
  if (!text) throw new AuthError("Note text is required.", 400);

  const existing = (await sql`
    SELECT
      n.id, n.tenant_id, n.candidate_id, n.author_user_id,
      COALESCE(up.full_name, up.email) AS author_name,
      n.note_text, n.created_at, n.updated_at, n.deleted_at, n.deleted_by_user_id
    FROM candidate_notes n
    LEFT JOIN user_profiles up ON up.user_id = n.author_user_id
    WHERE n.id = ${noteId} AND n.tenant_id = ${tenantId} AND n.deleted_at IS NULL
  `) as CandidateNote[];
  const note = existing[0];
  if (!note) return null;
  if (!canManageNote(user, note)) {
    throw new AuthError("You can only edit your own notes.", 403);
  }

  const rows = (await sql`
    UPDATE candidate_notes
    SET note_text = ${text}, updated_at = now()
    WHERE id = ${noteId} AND tenant_id = ${tenantId}
    RETURNING id, tenant_id, candidate_id, author_user_id, note_text,
              created_at, updated_at, deleted_at, deleted_by_user_id
  `) as Array<Omit<CandidateNote, "author_name">>;

  await sql`
    UPDATE candidates
    SET updated_by_user_id = ${user.id}, updated_at = now()
    WHERE id = ${note.candidate_id} AND tenant_id = ${tenantId}
  `;

  await logCandidateActivity({
    tenantId,
    candidateId: note.candidate_id,
    performedByUserId: user.id,
    actionType: "NOTE_EDITED",
    previousValue: note.note_text.slice(0, 200),
    newValue: text.slice(0, 200),
    metadata: {
      note_id: noteId,
      admin_override: note.author_user_id !== user.id,
    },
  });

  return {
    ...rows[0],
    author_name: note.author_name,
  };
}

export async function deleteCandidateNote(
  user: AppUser,
  noteId: string
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);

  const existing = (await sql`
    SELECT
      n.id, n.tenant_id, n.candidate_id, n.author_user_id,
      COALESCE(up.full_name, up.email) AS author_name,
      n.note_text, n.created_at, n.updated_at, n.deleted_at, n.deleted_by_user_id
    FROM candidate_notes n
    LEFT JOIN user_profiles up ON up.user_id = n.author_user_id
    WHERE n.id = ${noteId} AND n.tenant_id = ${tenantId} AND n.deleted_at IS NULL
  `) as CandidateNote[];
  const note = existing[0];
  if (!note) return false;
  if (!canManageNote(user, note)) {
    throw new AuthError("You can only delete your own notes.", 403);
  }

  await sql`
    UPDATE candidate_notes
    SET deleted_at = now(), deleted_by_user_id = ${user.id}, updated_at = now()
    WHERE id = ${noteId} AND tenant_id = ${tenantId}
  `;

  await sql`
    UPDATE candidates
    SET updated_by_user_id = ${user.id}, updated_at = now()
    WHERE id = ${note.candidate_id} AND tenant_id = ${tenantId}
  `;

  await logCandidateActivity({
    tenantId,
    candidateId: note.candidate_id,
    performedByUserId: user.id,
    actionType: "NOTE_DELETED",
    previousValue: note.note_text.slice(0, 200),
    metadata: {
      note_id: noteId,
      admin_override: note.author_user_id !== user.id,
    },
  });

  return true;
}

export async function countCandidateNotes(
  tenantId: string,
  candidateId: string
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM candidate_notes
    WHERE tenant_id = ${tenantId}
      AND candidate_id = ${candidateId}
      AND deleted_at IS NULL
  `) as { count: number }[];
  return Number(rows[0]?.count ?? 0);
}
