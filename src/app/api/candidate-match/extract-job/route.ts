import type { NextRequest } from "next/server";
import { extractText } from "@/lib/extract";
import { normalizeText } from "@/lib/extract";
import { ok, fail, logServerError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // File upload path (multipart/form-data).
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
        job_text: result.text,
        extraction_quality: result.quality,
        warnings: result.warnings,
      });
    }

    // Pasted-text path (application/json).
    const body = (await req.json()) as { text?: string };
    const text = normalizeText(body.text ?? "");
    if (text.length === 0) {
      return fail("No job-description text was provided.", 400, "EMPTY_TEXT");
    }
    return ok({ job_text: text, extraction_quality: "HIGH", warnings: [] });
  } catch (err) {
    logServerError("extract-job", err);
    return fail(
      "We could not process the job description. Please try again or paste the text.",
      500,
      "SERVER_ERROR"
    );
  }
}
