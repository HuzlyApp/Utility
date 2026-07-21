import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { normalizeText } from "@/lib/extract";
import { validateUpload, extractFromUpload } from "@/lib/files";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Unified extraction for job descriptions AND résumés: documents, images
// (OCR), and pasted text. Auth required.
export async function POST(req: NextRequest) {
  return withUser("extract", async () => {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return fail("No file was provided.", 400, "NO_FILE");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = validateUpload(buffer, file.name, file.type);
      if (!validation.ok) {
        return fail(validation.error ?? "Invalid file.", 422, "INVALID_FILE");
      }
      const result = await extractFromUpload(buffer, file.name, validation.isImage);
      return ok({
        text: result.text,
        extraction_quality: result.quality,
        extraction_method: result.method,
        is_image: result.isImage,
        ocr_confidence: result.ocrConfidence,
        needs_review: result.needsReview,
        warnings: result.warnings,
        width: validation.width,
        height: validation.height,
      });
    }

    const body = (await req.json()) as { text?: string };
    const text = normalizeText(body.text ?? "");
    if (text.length === 0) {
      return fail("No text was provided.", 400, "EMPTY_TEXT");
    }
    return ok({
      text,
      extraction_quality: "HIGH",
      extraction_method: "MANUAL",
      is_image: false,
      ocr_confidence: null,
      needs_review: false,
      warnings: [],
    });
  });
}
