import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import type { AppUser } from "@/lib/auth/session";
import type { EntityFile } from "./types";

export interface SaveFileInput {
  entityType: "job_workspace" | "candidate";
  entityId: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  bytes: Buffer;
  isImage: boolean;
  pageOrder?: number;
  extractedText?: string;
  extractionMethod?: string;
  extractionQuality?: string;
  ocrConfidence?: number | null;
  needsReview?: boolean;
}

// Persists the ORIGINAL file bytes (base64-encoded into bytea) plus its
// separately-stored extracted text and OCR metadata (spec §5/§12/§13). The
// logical storage_path is never exposed publicly; downloads go through an
// ownership-checked route.
export async function saveEntityFile(
  user: AppUser,
  input: SaveFileInput
): Promise<string> {
  const sql = getSql();
  const b64 = input.bytes.toString("base64");
  const rows = (await sql`
    INSERT INTO entity_files (
      entity_type, entity_id, owner_user_id, file_name, file_type, mime_type,
      byte_size, is_image, page_order, extracted_text, extraction_method,
      extraction_quality, ocr_confidence, needs_review, created_by, file_bytes, storage_path
    ) VALUES (
      ${input.entityType}, ${input.entityId}, ${user.id}, ${input.fileName},
      ${input.fileType}, ${input.mimeType}, ${input.bytes.length}, ${input.isImage},
      ${input.pageOrder ?? 0}, ${input.extractedText ?? null}, ${input.extractionMethod ?? null},
      ${input.extractionQuality ?? null}, ${input.ocrConfidence ?? null},
      ${input.needsReview ?? false}, ${user.id}, decode(${b64}, 'base64'), ${"db://entity_files"}
    ) RETURNING id
  `) as { id: string }[];
  const id = rows[0].id;
  // storage_path uses the row id, but is only ever resolved server-side.
  await sql`UPDATE entity_files SET storage_path = ${`db://entity_files/${id}`} WHERE id = ${id}`;
  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "entity_file",
    entityId: id,
    action: "FILE_UPLOADED",
    newValue: {
      entity: input.entityType,
      file_name: input.fileName,
      is_image: input.isImage,
      extraction_method: input.extractionMethod,
    },
  });
  return id;
}

export async function listEntityFiles(
  user: AppUser,
  entityType: "job_workspace" | "candidate",
  entityId: string
): Promise<EntityFile[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, entity_type, entity_id, owner_user_id, file_name, file_type, mime_type,
           byte_size, storage_path, is_image, page_order, extracted_text,
           extraction_method, extraction_quality, ocr_confidence, needs_review, created_at
    FROM entity_files
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      AND owner_user_id = ${user.id}
    ORDER BY page_order ASC, created_at ASC
  `) as EntityFile[];
  return rows;
}

export async function getFileForDownload(
  user: AppUser,
  fileId: string
): Promise<{ bytes: Buffer; mimeType: string; fileName: string } | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT encode(file_bytes, 'base64') AS file_b64, mime_type, file_name
    FROM entity_files
    WHERE id = ${fileId} AND owner_user_id = ${user.id}
  `) as Array<{ file_b64: string | null; mime_type: string | null; file_name: string }>;
  const row = rows[0];
  if (!row || !row.file_b64) return null;
  return {
    bytes: Buffer.from(row.file_b64, "base64"),
    mimeType: row.mime_type ?? "application/octet-stream",
    fileName: row.file_name,
  };
}

export async function updateFileExtractedText(
  user: AppUser,
  fileId: string,
  text: string
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE entity_files
    SET extracted_text = ${text}, extraction_method = 'MANUAL',
        needs_review = false, updated_at = now()
    WHERE id = ${fileId} AND owner_user_id = ${user.id}
    RETURNING id, entity_type, entity_id
  `) as Array<{ id: string; entity_type: string; entity_id: string }>;
  if (rows.length === 0) return false;
  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "entity_file",
    entityId: fileId,
    action: "FILE_TEXT_EDITED",
  });
  return true;
}

export async function reorderFile(
  user: AppUser,
  fileId: string,
  pageOrder: number
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE entity_files SET page_order = ${pageOrder}, updated_at = now()
    WHERE id = ${fileId} AND owner_user_id = ${user.id}
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function deleteEntityFile(
  user: AppUser,
  fileId: string
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM entity_files WHERE id = ${fileId} AND owner_user_id = ${user.id}
    RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return false;
  await audit({
    actorUserId: user.id,
    tenantId: user.tenantId,
    entityType: "entity_file",
    entityId: fileId,
    action: "FILE_DELETED",
  });
  return true;
}

// Returns page-ordered image bytes for an entity (used only for the controlled
// vision fallback when OCR/standard extraction fail, spec §9).
export async function getEntityImageBytes(
  user: AppUser,
  entityType: "job_workspace" | "candidate",
  entityId: string,
  limit = 5
): Promise<Array<{ bytes: Buffer; mimeType: string }>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT encode(file_bytes, 'base64') AS file_b64, mime_type
    FROM entity_files
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      AND owner_user_id = ${user.id} AND is_image = true
    ORDER BY page_order ASC, created_at ASC
    LIMIT ${limit}
  `) as Array<{ file_b64: string | null; mime_type: string | null }>;
  return rows
    .filter((r) => r.file_b64)
    .map((r) => ({
      bytes: Buffer.from(r.file_b64 as string, "base64"),
      mimeType: r.mime_type ?? "image/png",
    }));
}

// Combines a candidate's page-ordered résumé file text into one string used as
// the résumé for analysis (spec §5 multi-page grouping).
export async function combineCandidateResumeText(
  user: AppUser,
  candidateId: string
): Promise<{ text: string; minOcrConfidence: number | null; anyNeedsReview: boolean }> {
  const files = await listEntityFiles(user, "candidate", candidateId);
  const parts: string[] = [];
  let minConf: number | null = null;
  let needsReview = false;
  for (const f of files) {
    if (f.extracted_text && f.extracted_text.trim()) parts.push(f.extracted_text.trim());
    if (f.ocr_confidence != null) {
      minConf = minConf == null ? f.ocr_confidence : Math.min(minConf, f.ocr_confidence);
    }
    if (f.needs_review) needsReview = true;
  }
  return { text: parts.join("\n\n"), minOcrConfidence: minConf, anyNeedsReview: needsReview };
}
