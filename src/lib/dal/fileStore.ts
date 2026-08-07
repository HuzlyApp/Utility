import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import { AuthError, type AppUser } from "@/lib/auth/session";
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

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
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
  const tenantId = tenantIdOf(user);
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
    tenantId,
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
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT id, entity_type, entity_id, owner_user_id, file_name, file_type, mime_type,
           byte_size, storage_path, is_image, page_order, extracted_text,
           extraction_method, extraction_quality, ocr_confidence, needs_review, created_at
    FROM entity_files
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      AND (
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE ${entityType} = 'candidate'
            AND c.id = ${entityId}
            AND c.tenant_id = ${tenantId}
        )
        OR EXISTS (
          SELECT 1 FROM job_match_workspaces w
          WHERE ${entityType} = 'job_workspace'
            AND w.id = ${entityId}
            AND w.tenant_id = ${tenantId}
        )
      )
    ORDER BY page_order ASC, created_at ASC
  `) as EntityFile[];
  return rows;
}

export async function getFileForDownload(
  user: AppUser,
  fileId: string
): Promise<{ bytes: Buffer; mimeType: string; fileName: string } | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT encode(file_bytes, 'base64') AS file_b64, mime_type, file_name
    FROM entity_files f
    WHERE id = ${fileId}
      AND (
        EXISTS (
          SELECT 1
          FROM candidates c
          WHERE f.entity_type = 'candidate'
            AND c.id = f.entity_id
            AND c.tenant_id = ${tenantId}
        )
        OR EXISTS (
          SELECT 1
          FROM job_match_workspaces w
          WHERE f.entity_type = 'job_workspace'
            AND w.id = f.entity_id
            AND w.tenant_id = ${tenantId}
        )
      )
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
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    UPDATE entity_files
    SET extracted_text = ${text}, extraction_method = 'MANUAL',
        needs_review = false, updated_at = now()
    WHERE id = ${fileId}
      AND (
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE entity_type = 'candidate' AND c.id = entity_id AND c.tenant_id = ${tenantId}
        )
        OR EXISTS (
          SELECT 1 FROM job_match_workspaces w
          WHERE entity_type = 'job_workspace' AND w.id = entity_id AND w.tenant_id = ${tenantId}
        )
      )
    RETURNING id, entity_type, entity_id
  `) as Array<{ id: string; entity_type: string; entity_id: string }>;
  if (rows.length === 0) return false;
  await audit({
    actorUserId: user.id,
    tenantId,
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
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    UPDATE entity_files SET page_order = ${pageOrder}, updated_at = now()
    WHERE id = ${fileId}
      AND (
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE entity_type = 'candidate' AND c.id = entity_id AND c.tenant_id = ${tenantId}
        )
        OR EXISTS (
          SELECT 1 FROM job_match_workspaces w
          WHERE entity_type = 'job_workspace' AND w.id = entity_id AND w.tenant_id = ${tenantId}
        )
      )
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function deleteEntityFile(
  user: AppUser,
  fileId: string
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    DELETE FROM entity_files
    WHERE id = ${fileId}
      AND (
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE entity_type = 'candidate' AND c.id = entity_id AND c.tenant_id = ${tenantId}
        )
        OR EXISTS (
          SELECT 1 FROM job_match_workspaces w
          WHERE entity_type = 'job_workspace' AND w.id = entity_id AND w.tenant_id = ${tenantId}
        )
      )
    RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return false;
  await audit({
    actorUserId: user.id,
    tenantId,
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
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT encode(file_bytes, 'base64') AS file_b64, mime_type
    FROM entity_files
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      AND (
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE ${entityType} = 'candidate' AND c.id = ${entityId} AND c.tenant_id = ${tenantId}
        )
        OR EXISTS (
          SELECT 1 FROM job_match_workspaces w
          WHERE ${entityType} = 'job_workspace' AND w.id = ${entityId} AND w.tenant_id = ${tenantId}
        )
      )
      AND is_image = true
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

export async function getCandidateResumeFilesWithBytes(
  user: AppUser,
  candidateId: string
): Promise<
  Array<{
    id: string;
    fileName: string;
    fileType: string | null;
    mimeType: string | null;
    isImage: boolean;
    extractedText: string | null;
    bytes: Buffer | null;
  }>
> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT f.id, f.file_name, f.file_type, f.mime_type, f.is_image,
           f.extracted_text, encode(f.file_bytes, 'base64') AS file_b64
    FROM entity_files f
    JOIN candidates c ON c.id = f.entity_id AND c.tenant_id = ${tenantId}
    WHERE f.entity_type = 'candidate'
      AND f.entity_id = ${candidateId}
    ORDER BY f.page_order ASC, f.created_at ASC
  `) as Array<{
    id: string;
    file_name: string;
    file_type: string | null;
    mime_type: string | null;
    is_image: boolean;
    extracted_text: string | null;
    file_b64: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    fileType: r.file_type,
    mimeType: r.mime_type,
    isImage: Boolean(r.is_image),
    extractedText: r.extracted_text,
    bytes: r.file_b64 ? Buffer.from(r.file_b64, "base64") : null,
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
