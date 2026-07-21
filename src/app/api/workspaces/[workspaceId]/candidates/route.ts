import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getWorkspace } from "@/lib/dal/workspaces";
import {
  createCandidate,
  updateCandidate,
  attachCandidateToWorkspace,
  listWorkspaceCandidates,
} from "@/lib/dal/candidates";
import { saveEntityFile } from "@/lib/dal/fileStore";
import { validateUpload, extractFromUpload } from "@/lib/files";
import { normalizeText } from "@/lib/extract";
import type { CandidatePipelineStatus } from "@/lib/dal/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Returns the workspace ranking rows (used for progressive dashboard refresh).
export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withUser("candidates.list", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");
    const rows = await listWorkspaceCandidates(user, params.workspaceId);
    return ok({ candidates: rows });
  });
}

// Adds ONE candidate, grouping every uploaded file as an ordered résumé page
// plus optional pasted text (spec §5/§7/§8). Individual file failures never
// fail the whole candidate.
export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withUser("candidates.add", async (user) => {
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return fail("Expected a multipart upload.", 400, "BAD_REQUEST");
    }

    const form = await req.formData();
    const providedName = String(form.get("name") ?? "").trim();
    const pastedText = normalizeText(String(form.get("pasted_text") ?? ""));
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0 && !pastedText) {
      return fail("Provide at least one file or pasted résumé text.", 400, "EMPTY");
    }

    const candidateId = await createCandidate(user, {
      full_name: providedName || "Unnamed candidate",
    });

    const textParts: string[] = [];
    if (pastedText) textParts.push(pastedText);

    const fileResults: Array<{
      file_name: string;
      status: "READY" | "NEEDS_REVIEW" | "FAILED";
      extraction_quality: string;
      ocr_confidence: number | null;
      is_image: boolean;
      error?: string;
    }> = [];

    let anyNeedsReview = false;
    let minOcr: number | null = null;
    let pageOrder = pastedText ? 1 : 0;

    for (const file of files) {
      const name = file.name;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const validation = validateUpload(buffer, name, file.type);
        if (!validation.ok) {
          fileResults.push({
            file_name: name,
            status: "FAILED",
            extraction_quality: "FAILED",
            ocr_confidence: null,
            is_image: validation.isImage,
            error: validation.error,
          });
          continue;
        }
        const extraction = await extractFromUpload(buffer, name, validation.isImage);
        await saveEntityFile(user, {
          entityType: "candidate",
          entityId: candidateId,
          fileName: name,
          fileType: validation.ext,
          mimeType: validation.mimeType,
          bytes: buffer,
          isImage: validation.isImage,
          pageOrder: pageOrder++,
          extractedText: extraction.text,
          extractionMethod: extraction.method,
          extractionQuality: extraction.quality,
          ocrConfidence: extraction.ocrConfidence,
          needsReview: extraction.needsReview,
        });
        if (extraction.text.trim()) textParts.push(extraction.text.trim());
        if (extraction.ocrConfidence != null) {
          minOcr = minOcr == null ? extraction.ocrConfidence : Math.min(minOcr, extraction.ocrConfidence);
        }
        if (extraction.needsReview) anyNeedsReview = true;
        fileResults.push({
          file_name: name,
          status: extraction.needsReview ? "NEEDS_REVIEW" : "READY",
          extraction_quality: extraction.quality,
          ocr_confidence: extraction.ocrConfidence,
          is_image: extraction.isImage,
        });
      } catch {
        fileResults.push({
          file_name: name,
          status: "FAILED",
          extraction_quality: "FAILED",
          ocr_confidence: null,
          is_image: false,
          error: "Processing failed for this file.",
        });
      }
    }

    const combined = textParts.join("\n\n").trim();
    let status: CandidatePipelineStatus;
    if (!combined) status = "NEEDS_REVIEW";
    else if (anyNeedsReview) status = "NEEDS_REVIEW";
    else status = "READY";

    await updateCandidate(user, candidateId, {
      extracted_resume_text: combined,
      ocr_confidence: minOcr,
      extraction_quality: anyNeedsReview ? "LOW" : combined ? "HIGH" : "FAILED",
    });

    await attachCandidateToWorkspace(user, params.workspaceId, candidateId, status);

    return ok({
      candidate_id: candidateId,
      status,
      files: fileResults,
      has_text: Boolean(combined),
    });
  });
}
