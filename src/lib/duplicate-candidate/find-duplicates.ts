import "server-only";
import { createHash } from "crypto";
import { getSql } from "@/lib/dal/client";
import { AuthError, type AppUser } from "@/lib/auth/session";
import {
  isCheckableCandidateName,
  normalizeCandidateName,
  normalizeEmail,
  normalizePhone,
} from "./normalize";
import {
  matchedSecondaryIdentifiers,
  resolveDuplicateConfidence,
  type CandidateIdentity,
} from "./classify";
import { issueDuplicateConfirmationToken } from "./confirmation-token";
import type { DuplicateCheckResult, DuplicateMatch } from "./types";

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

function hashResumeBytes(b64Chunks: string[]): string | null {
  if (b64Chunks.length === 0) return null;
  const hash = createHash("sha256");
  for (const chunk of b64Chunks.sort()) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** Hash raw upload buffers for duplicate comparison at upload time. */
export function hashUploadBuffers(buffers: Buffer[]): string | null {
  if (buffers.length === 0) return null;
  const hash = createHash("sha256");
  for (const buf of buffers.sort((a, b) => a.compare(b))) {
    hash.update(buf);
  }
  return hash.digest("hex");
}

async function getCandidateResumeHash(
  user: AppUser,
  candidateId: string
): Promise<string | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT encode(file_bytes, 'base64') AS file_b64
    FROM entity_files
    WHERE entity_type = 'candidate'
      AND entity_id = ${candidateId}
      AND owner_user_id IN (SELECT user_id FROM user_profiles WHERE tenant_id = ${tenantId})
      AND file_bytes IS NOT NULL
  `) as Array<{ file_b64: string | null }>;
  return hashResumeBytes(
    rows.map((r) => r.file_b64).filter((v): v is string => Boolean(v))
  );
}

interface RawMatchRow {
  candidate_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  analysis_id: string | null;
  job_title: string | null;
  created_at: string | null;
  match_category: string | null;
  disposition: string | null;
}

export interface DuplicateSearchOptions {
  excludeCandidateId?: string;
  /** Used when checking before a candidate record exists (upload). */
  resumeHash?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Token subject when no candidate id exists yet. */
  tokenSubjectId?: string;
}

/**
 * Search for candidates with the same normalized name already attached to
 * this workspace. Returns null when no check is needed or no matches found.
 */
export async function findDuplicateCandidatesInWorkspace(
  user: AppUser,
  workspaceId: string,
  candidateName: string | null | undefined,
  options: DuplicateSearchOptions = {}
): Promise<DuplicateCheckResult | null> {
  if (!isCheckableCandidateName(candidateName)) return null;

  const normalizedName = normalizeCandidateName(candidateName!);
  if (!normalizedName) return null;

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const excludeId = options.excludeCandidateId ?? null;

  const rows = (await sql`
    SELECT
      c.id AS candidate_id,
      c.full_name,
      c.email,
      c.phone,
      a.id AS analysis_id,
      COALESCE(a.job_title, ws.job_title) AS job_title,
      a.created_at,
      a.match_category,
      d.disposition
    FROM job_match_candidates jmc
    JOIN candidates c ON c.id = jmc.candidate_id
    JOIN job_match_workspaces ws ON ws.id = jmc.workspace_id
    LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    LEFT JOIN LATERAL (
      SELECT disposition
      FROM recruiter_dispositions rd
      WHERE rd.candidate_id = c.id AND rd.workspace_id = jmc.workspace_id
      ORDER BY created_at DESC
      LIMIT 1
    ) d ON true
    WHERE jmc.workspace_id = ${workspaceId}
      AND c.tenant_id = ${tenantId}
      AND ws.tenant_id = ${tenantId}
      AND c.normalized_full_name = ${normalizedName}
      AND (${excludeId}::uuid IS NULL OR c.id != ${excludeId})
    ORDER BY a.created_at DESC NULLS LAST, c.full_name ASC
  `) as RawMatchRow[];

  if (rows.length === 0) return null;

  const currentIdentity: CandidateIdentity = {
    candidate_id: options.excludeCandidateId ?? options.tokenSubjectId ?? "pending-upload",
    email: normalizeEmail(options.email),
    phone: normalizePhone(options.phone),
    resume_hash: options.resumeHash ?? null,
  };

  const matches: DuplicateMatch[] = [];
  for (const row of rows) {
    const otherResumeHash = await getCandidateResumeHash(user, row.candidate_id);
    const otherIdentity: CandidateIdentity = {
      candidate_id: row.candidate_id,
      email: normalizeEmail(row.email),
      phone: normalizePhone(row.phone),
      resume_hash: otherResumeHash,
    };
    matches.push({
      candidate_id: row.candidate_id,
      analysis_id: row.analysis_id,
      job_title: row.job_title,
      created_at: row.created_at ? String(row.created_at) : null,
      match_category: row.match_category,
      disposition: row.disposition,
      matched_identifiers: matchedSecondaryIdentifiers(currentIdentity, otherIdentity),
    });
  }

  const duplicate_confidence = resolveDuplicateConfidence(matches);
  const matchedCandidateIds = matches.map((m) => m.candidate_id);
  const matchedAnalysisIds = matches
    .map((m) => m.analysis_id)
    .filter((id): id is string => Boolean(id));

  const tokenSubjectId =
    options.excludeCandidateId ??
    options.tokenSubjectId ??
    `upload:${workspaceId}`;

  const duplicate_confirmation_token = issueDuplicateConfirmationToken({
    userId: user.id,
    tenantId,
    candidateId: tokenSubjectId,
    normalizedName,
    matchedCandidateIds,
    matchedAnalysisIds,
    confidence: duplicate_confidence,
  });

  return {
    candidate_name: candidateName!.trim(),
    normalized_name: normalizedName,
    duplicate_confidence,
    matches: matches.map(({ matched_identifiers: _mi, ...rest }) => rest),
    duplicate_confirmation_token,
  };
}

/** Analyze-time duplicate check scoped to the workspace. */
export async function findDuplicateCandidates(
  user: AppUser,
  workspaceId: string,
  candidateId: string,
  candidateName: string | null | undefined
): Promise<DuplicateCheckResult | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const currentRows = (await sql`
    SELECT email, phone FROM candidates
    WHERE id = ${candidateId}
      AND tenant_id = ${tenantId}
  `) as Array<{ email: string | null; phone: string | null }>;
  const currentRow = currentRows[0];
  if (!currentRow) return null;

  const resumeHash = await getCandidateResumeHash(user, candidateId);

  return findDuplicateCandidatesInWorkspace(user, workspaceId, candidateName, {
    excludeCandidateId: candidateId,
    email: currentRow.email,
    phone: currentRow.phone,
    resumeHash,
    tokenSubjectId: candidateId,
  });
}
