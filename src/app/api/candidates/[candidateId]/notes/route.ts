import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { AuthError } from "@/lib/auth/session";
import { createCandidateNote, listCandidateNotes } from "@/lib/dal/notes";
import { getCandidate } from "@/lib/dal/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.notes.get", async (user) => {
    const candidate = await getCandidate(user, params.candidateId);
    if (!candidate) return fail("Candidate not found.", 404, "NOT_FOUND");
    const notes = await listCandidateNotes(user, params.candidateId);
    return ok({ notes });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  return withTenantUser("candidates.notes.post", async (user) => {
    try {
      const body = (await req.json()) as { noteText?: string };
      const note = await createCandidateNote(
        user,
        params.candidateId,
        body.noteText ?? ""
      );
      return ok({ note }, 201);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, err.status === 404 ? "NOT_FOUND" : "FORBIDDEN");
      }
      throw err;
    }
  });
}
