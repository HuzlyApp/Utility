import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { withTenantUser } from "@/lib/api-helpers";
import { getWorkspace } from "@/lib/dal/workspaces";
import {
  createCandidate,
  updateCandidate,
  attachCandidateToWorkspace,
  listWorkspaceCandidates,
  applyResumeContactExtraction,
} from "@/lib/dal/candidates";
import { saveEntityFile } from "@/lib/dal/fileStore";
import { validateUpload, extractFromUpload } from "@/lib/files";
import { normalizeText } from "@/lib/extract";
import type { CandidatePipelineStatus } from "@/lib/dal/types";
import {
  findDuplicateCandidatesInWorkspace,
  hashUploadBuffers,
} from "@/lib/duplicate-candidate/find-duplicates";
import {
  consumeDuplicateConfirmationToken,
  verifyDuplicateConfirmationToken,
} from "@/lib/duplicate-candidate/confirmation-token";
import { audit } from "@/lib/dal/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Returns the workspace ranking rows (used for progressive dashboard refresh).
export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  return withTenantUser("candidates.list", async (user) => {
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
  return withTenantUser("candidates.add", async (user) => {
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
    const continueAfterDuplicateWarning =
      String(form.get("continue_after_duplicate_warning") ?? "") === "true";
    const duplicateConfirmationToken = String(
      form.get("duplicate_confirmation_token") ?? ""
    ).trim();

    if (files.length === 0 && !pastedText) {
      return fail("Provide at least one file or pasted résumé text.", 400, "EMPTY");
    }

    const fileBuffers: Buffer[] = [];
    for (const file of files) {
      fileBuffers.push(Buffer.from(await file.arrayBuffer()));
    }
    const uploadResumeHash = hashUploadBuffers(fileBuffers);

    const duplicateCheck = await findDuplicateCandidatesInWorkspace(
      user,
      params.workspaceId,
      providedName || "Unnamed candidate",
      {
        resumeHash: uploadResumeHash,
        tokenSubjectId: `upload:${params.workspaceId}`,
      }
    );

    let duplicateOverride = false;
    if (duplicateCheck) {
      if (!continueAfterDuplicateWarning || !duplicateConfirmationToken) {
        return NextResponse.json(
          {
            success: false,
            status: "DUPLICATE_CONFIRMATION_REQUIRED",
            code: "DUPLICATE_CONFIRMATION_REQUIRED",
            candidate_name: duplicateCheck.candidate_name,
            duplicate_confidence: duplicateCheck.duplicate_confidence,
            matches: duplicateCheck.matches,
            duplicate_confirmation_token: duplicateCheck.duplicate_confirmation_token,
          },
          { status: 409 }
        );
      }

      const matchedCandidateIds = duplicateCheck.matches.map((m) => m.candidate_id);
      const matchedAnalysisIds = duplicateCheck.matches
        .map((m) => m.analysis_id)
        .filter((id): id is string => Boolean(id));

      const verified = verifyDuplicateConfirmationToken(duplicateConfirmationToken, {
        userId: user.id,
        tenantId: user.tenantId,
        candidateId: `upload:${params.workspaceId}`,
        normalizedName: duplicateCheck.normalized_name,
        matchedCandidateIds,
        matchedAnalysisIds,
        confidence: duplicateCheck.duplicate_confidence,
      });

      if (!verified.ok) {
        return fail(
          "Duplicate confirmation is invalid or expired. Please review the warning and try again.",
          409,
          verified.reason
        );
      }

      consumeDuplicateConfirmationToken(verified.payload.jti, verified.payload.exp);
      duplicateOverride = true;
    }

    const candidateId = await createCandidate(user, {
      full_name: providedName || "Unnamed candidate",
    });

    if (duplicateOverride) {
      await audit({
        actorUserId: user.id,
        tenantId: user.tenantId,
        entityType: "candidate",
        entityId: candidateId,
        action: "DUPLICATE_WARNING_OVERRIDDEN",
        newValue: {
          candidate_name: duplicateCheck!.candidate_name,
          workspace_id: params.workspaceId,
          matched_analysis_ids: duplicateCheck!.matches
            .map((m) => m.analysis_id)
            .filter(Boolean),
          duplicate_confidence: duplicateCheck!.duplicate_confidence,
          context: "upload",
        },
      });
    }

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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = fileBuffers[i];
      const name = file.name;
      try {
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
          is_image: validation.isImage,
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

    const primaryFileType =
      fileResults.find((f) => f.status !== "FAILED")?.file_name?.split(".").pop() ??
      (pastedText ? "txt" : null);

    const contact = await applyResumeContactExtraction(user, candidateId, combined, {
      workspaceId: params.workspaceId,
      fileType: primaryFileType,
    });

    await attachCandidateToWorkspace(user, params.workspaceId, candidateId, status);

    return ok({
      candidate_id: candidateId,
      status,
      files: fileResults,
      has_text: Boolean(combined),
      contact_extraction_status: contact.status,
      email: contact.email,
      phone: contact.phone,
    });
  });
}
