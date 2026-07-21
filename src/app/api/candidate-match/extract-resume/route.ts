import type { NextRequest } from "next/server";
import { extractText, normalizeText } from "@/lib/extract";
import { ok, fail, logServerError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return fail("No file was provided.", 400, "NO_FILE");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await extractText(buffer, file.name);
      if (!result.success) {
        return fail(result.error ?? "Extraction failed.", 422, "EXTRACTION_FAILED");
      }
      return ok({
        resume_text: result.text,
        extraction_quality: result.quality,
        warnings: result.warnings,
      });
    }

    const body = (await req.json()) as { text?: string };
    const text = normalizeText(body.text ?? "");
    if (text.length === 0) {
      return fail("No résumé text was provided.", 400, "EMPTY_TEXT");
    }
    return ok({ resume_text: text, extraction_quality: "HIGH", warnings: [] });
  } catch (err) {
    logServerError("extract-resume", err);
    return fail(
      "We could not process the résumé. Please try again or paste the text.",
      500,
      "SERVER_ERROR"
    );
  }
}
