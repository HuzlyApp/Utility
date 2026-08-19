import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { getWorkspace } from "@/lib/dal/workspaces";
import {
  importExistingCandidatesToWorkspace,
  parseImportSearchParams,
  searchCandidatesForImport,
} from "@/lib/dal/candidate-import";
import {
  IMPORT_MAX_IDS_PER_REQUEST,
  isImportCandidateUuid,
} from "@/lib/candidate-import-match";
import { AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withTenantUser("candidates.import.search", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");

    try {
      const filters = parseImportSearchParams(new URL(req.url));
      const result = await searchCandidatesForImport(
        user,
        params.workspaceId,
        filters
      );
      return ok(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, err.status === 404 ? "NOT_FOUND" : "FORBIDDEN");
      }
      throw err;
    }
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withTenantUser("candidates.import", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body.", 400, "BAD_REQUEST");
    }

    const rawIds =
      body && typeof body === "object" && Array.isArray((body as { candidateIds?: unknown }).candidateIds)
        ? (body as { candidateIds: unknown[] }).candidateIds
        : null;
    if (!rawIds) {
      return fail("Provide candidateIds to import.", 400, "BAD_REQUEST");
    }

    const candidateIds = rawIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean);

    if (candidateIds.length === 0) {
      return fail("Select at least one candidate to import.", 400, "EMPTY");
    }
    if (candidateIds.length > IMPORT_MAX_IDS_PER_REQUEST) {
      return fail(
        `Import at most ${IMPORT_MAX_IDS_PER_REQUEST} candidates at a time.`,
        400,
        "TOO_MANY"
      );
    }
    if (candidateIds.some((id) => !isImportCandidateUuid(id))) {
      return fail("Each candidate must be referenced by its database ID.", 400, "BAD_REQUEST");
    }

    try {
      const result = await importExistingCandidatesToWorkspace(
        user,
        params.workspaceId,
        candidateIds
      );
      const importedCount = result.imported.length;
      const skippedCount = result.skippedAlreadyAdded.length;
      let message =
        importedCount === 1
          ? "1 candidate successfully added."
          : `${importedCount} candidates successfully added.`;
      if (skippedCount > 0) {
        message = `${importedCount} candidate${importedCount === 1 ? "" : "s"} added. ${skippedCount} candidate${skippedCount === 1 ? " was" : "s were"} skipped because they already belong to this job.`;
      }
      return ok({
        ...result,
        importedCount,
        skippedCount,
        skippedNotFoundCount: result.skippedNotFound.length,
        jobTitle: ws.job_title,
        jobRef: ws.job_ref,
        message,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, err.status === 404 ? "NOT_FOUND" : "FORBIDDEN");
      }
      throw err;
    }
  });
}
