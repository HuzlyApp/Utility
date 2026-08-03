import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import { deleteCandidateNote, updateCandidateNote } from "@/lib/dal/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { candidateId: string; noteId: string } }
) {
  return withTenantUser("candidates.notes.patch", async (user) => {
    try {
      const body = (await req.json()) as { noteText?: string };
      const note = await updateCandidateNote(user, params.noteId, body.noteText ?? "");
      if (!note) return fail("Note not found.", 404, "NOT_FOUND");
      if (note.candidate_id !== params.candidateId) {
        return fail("Note not found.", 404, "NOT_FOUND");
      }
      return ok({ note });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { candidateId: string; noteId: string } }
) {
  return withTenantUser("candidates.notes.delete", async (user) => {
    try {
      const deleted = await deleteCandidateNote(user, params.noteId);
      if (!deleted) return fail("Note not found.", 404, "NOT_FOUND");
      return ok({ id: params.noteId, deleted: true });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
