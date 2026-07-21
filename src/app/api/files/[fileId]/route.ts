import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { requireUser, AuthError } from "@/lib/auth/session";
import {
  getFileForDownload,
  updateFileExtractedText,
  reorderFile,
  deleteEntityFile,
} from "@/lib/dal/fileStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Secure, ownership-checked download. Storage paths are never exposed; access
// is only via this route after server-side session validation (spec §14).
export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const user = await requireUser();
    const file = await getFileForDownload(user, params.fileId);
    if (!file) return fail("File not found.", 404, "NOT_FOUND");
    return new NextResponse(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail("Could not load the file.", 500, "SERVER_ERROR");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  return withUser("files.update", async (user) => {
    const body = (await req.json()) as { extracted_text?: string; page_order?: number };
    if (typeof body.page_order === "number") {
      const okReorder = await reorderFile(user, params.fileId, body.page_order);
      if (!okReorder) return fail("File not found.", 404, "NOT_FOUND");
    }
    if (typeof body.extracted_text === "string") {
      const okText = await updateFileExtractedText(user, params.fileId, body.extracted_text);
      if (!okText) return fail("File not found.", 404, "NOT_FOUND");
    }
    return ok({});
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  return withUser("files.delete", async (user) => {
    const deleted = await deleteEntityFile(user, params.fileId);
    if (!deleted) return fail("File not found.", 404, "NOT_FOUND");
    return ok({});
  });
}
