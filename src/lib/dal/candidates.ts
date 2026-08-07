import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import { logCandidateActivity } from "./activity";
import { getDefaultStatusId, getStatusById } from "./statuses";
import { AuthError, type AppUser } from "@/lib/auth/session";
import type { VerifiedRecruiterInputs } from "@/lib/types";
import { normalizeCandidateName, normalizeEmail, normalizePhone } from "@/lib/duplicate-candidate/normalize";
import { mapStatusNameToActivityType, sourceFromRole } from "@/lib/recruiter-activity";
import { buildStatusChangeMetadata, toCandidateSearchPattern, toPhoneDigitsSearchPattern } from "@/lib/candidate-crm";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import {
  canAutoRetryContactExtraction,
  canOverwriteContactWithResume,
  classifyContactExtractionFailure,
  extractContactsFromResumeText,
  getSafeContactExtractionError,
  hasCompleteContactDetails,
  hasContactDetails,
  isCorruptEmailValue,
  isCorruptPhoneValue,
  logContactExtractionEvent,
  normalizeContactExtractionStatus,
  resolveTerminalContactStatus,
  CONTACT_EXTRACTION_MAX_ATTEMPTS,
  CONTACT_EXTRACTION_STALE_MS,
  type ContactExtractionStatus,
  type ContactSource,
} from "@/lib/contact-extract";
import type {
  Candidate,
  CandidatePipelineStatus,
  RankedCandidateRow,
} from "./types";
import { extractFromUpload } from "@/lib/files";
import { getCandidateResumeFilesWithBytes } from "@/lib/dal/fileStore";

export interface CandidateInput {
  full_name?: string;
  email?: string;
  phone?: string;
  /** When true, mark email/phone changes as MANUAL / MANUAL_CORRECTED. */
  contactManualEdit?: boolean;
  specialty?: string;
  location?: string;
  extracted_resume_text?: string;
  ocr_confidence?: number | null;
  extraction_quality?: string;
  recruiter_notes?: string;
  verified_information?: VerifiedRecruiterInputs;
}

const num = (v: unknown) => (v == null ? null : Number(v));

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

export async function createCandidate(
  user: AppUser,
  input: CandidateInput
): Promise<string> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const normalizedName = input.full_name
    ? normalizeCandidateName(input.full_name) || null
    : null;
  const defaultStatusId = await getDefaultStatusId(tenantId);
  const rows = (await sql`
    INSERT INTO candidates (
      owner_user_id, tenant_id, full_name, normalized_full_name, email, phone, specialty, location,
      extracted_resume_text, ocr_confidence, extraction_quality, recruiter_notes,
      verified_information, created_by, created_by_user_id, updated_by_user_id,
      current_status_id, assigned_recruiter_id,
      contact_extraction_status, contact_extraction_attempts
    ) VALUES (
      ${user.id}, ${tenantId}, ${input.full_name ?? null}, ${normalizedName}, ${input.email ?? null},
      ${input.phone ?? null}, ${input.specialty ?? null}, ${input.location ?? null},
      ${input.extracted_resume_text ?? null}, ${input.ocr_confidence ?? null},
      ${input.extraction_quality ?? null}, ${input.recruiter_notes ?? null},
      ${JSON.stringify(input.verified_information ?? {})}, ${user.id}, ${user.id}, ${user.id},
      ${defaultStatusId}, ${user.id},
      ${"not_started"}, ${0}
    ) RETURNING id
  `) as { id: string }[];
  const id = rows[0].id;
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: id,
    action: "CANDIDATE_CREATED",
    newValue: { full_name: input.full_name },
  });
  await logCandidateActivity({
    tenantId,
    candidateId: id,
    performedByUserId: user.id,
    actionType: "CANDIDATE_CREATED",
    newValue: input.full_name ?? null,
  });
  if (input.extracted_resume_text) {
    await logCandidateActivity({
      tenantId,
      candidateId: id,
      performedByUserId: user.id,
      actionType: "RESUME_UPLOADED",
    });
  }
  return id;
}

export async function getCandidate(
  user: AppUser,
  id: string
): Promise<Candidate | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT * FROM candidates WHERE id = ${id} AND tenant_id = ${tenantId}
  `) as Candidate[];
  return rows[0] ?? null;
}

export async function updateCandidate(
  user: AppUser,
  id: string,
  input: CandidateInput
): Promise<boolean> {
  const existing = await getCandidate(user, id);
  if (!existing) return false;
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const nextName = input.full_name ?? existing.full_name;
  const normalizedName = nextName ? normalizeCandidateName(nextName) || null : null;

  const nextEmail = input.email !== undefined ? input.email : existing.email;
  const nextPhone = input.phone !== undefined ? input.phone : existing.phone;
  const emailChanged =
    input.email !== undefined &&
    (input.email ?? "").trim() !== (existing.email ?? "").trim();
  const phoneChanged =
    input.phone !== undefined &&
    (input.phone ?? "").trim() !== (existing.phone ?? "").trim();

  let emailSource = existing.email_source ?? null;
  let phoneSource = existing.phone_source ?? null;
  if (input.contactManualEdit) {
    if (emailChanged) {
      emailSource = existing.email_source === "RESUME" || existing.email
        ? "MANUAL_CORRECTED"
        : "MANUAL";
    }
    if (phoneChanged) {
      phoneSource = existing.phone_source === "RESUME" || existing.phone
        ? "MANUAL_CORRECTED"
        : "MANUAL";
    }
  }

  const nextResumeText =
    input.extracted_resume_text !== undefined
      ? input.extracted_resume_text
      : existing.extracted_resume_text;
  const resumeTextChanged =
    input.extracted_resume_text !== undefined &&
    (input.extracted_resume_text ?? "").trim() !==
      (existing.extracted_resume_text ?? "").trim();
  const nextResumeVersion = resumeTextChanged
    ? Number(existing.contact_extraction_resume_version ?? existing.resume_version ?? 0) + 1
    : Number(existing.contact_extraction_resume_version ?? existing.resume_version ?? 0);

  await sql`
    UPDATE candidates SET
      full_name = ${nextName},
      normalized_full_name = ${normalizedName},
      email = ${nextEmail},
      phone = ${nextPhone},
      email_normalized = ${normalizeEmail(nextEmail)},
      phone_normalized = ${normalizePhone(nextPhone)},
      email_source = ${emailSource},
      phone_source = ${phoneSource},
      specialty = ${input.specialty ?? existing.specialty},
      location = ${input.location ?? existing.location},
      extracted_resume_text = ${nextResumeText},
      ocr_confidence = ${input.ocr_confidence ?? existing.ocr_confidence},
      extraction_quality = ${input.extraction_quality ?? existing.extraction_quality},
      recruiter_notes = ${input.recruiter_notes ?? existing.recruiter_notes},
      verified_information = ${JSON.stringify(
        input.verified_information ?? existing.verified_information
      )},
      contact_extraction_resume_version = ${nextResumeVersion},
      contact_extraction_status = ${
        resumeTextChanged ? "not_started" : existing.contact_extraction_status ?? "not_started"
      },
      contact_extraction_error = ${
        resumeTextChanged ? null : existing.contact_extraction_error ?? null
      },
      contact_extraction_attempts = ${
        resumeTextChanged ? 0 : Number(existing.contact_extraction_attempts ?? 0)
      },
      updated_by_user_id = ${user.id},
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
  `;
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: id,
    action: "CANDIDATE_UPDATED",
  });
  return true;
}

/**
 * Parse résumé text and persist phone/email unless manually corrected.
 * Always ends in a terminal status (completed | not_found | failed | stale handled elsewhere).
 */
export async function applyResumeContactExtraction(
  user: AppUser,
  candidateId: string,
  resumeText: string | null | undefined,
  opts?: {
    force?: boolean;
    workspaceId?: string | null;
    fileType?: string | null;
    /** When true, do not count against / increment attempt budget (claim-only path). */
    manualRetry?: boolean;
    resumeVersion?: number | null;
  }
): Promise<{
  status: ContactExtractionStatus;
  email: string | null;
  phone: string | null;
  attempts: number;
  error: string | null;
}> {
  const existing = await getCandidate(user, candidateId);
  if (!existing) {
    throw new AuthError("Candidate not found.", 404);
  }
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const force = opts?.force ?? false;
  const priorAttempts = Number(existing.contact_extraction_attempts ?? 0);
  const resumeVersion = Number(
    opts?.resumeVersion ??
      existing.contact_extraction_resume_version ??
      existing.resume_version ??
      0
  );
  const startedAt = Date.now();

  // Idempotency: skip if this resume version was already extracted successfully.
  const priorStatus = normalizeContactExtractionStatus(
    existing.contact_extraction_status
  );
  const priorVersion = Number(
    existing.contact_extraction_resume_version ?? existing.resume_version ?? 0
  );
  if (
    !force &&
    !opts?.manualRetry &&
    priorVersion === resumeVersion &&
    (priorStatus === "completed" || priorStatus === "not_found") &&
    Number(existing.contact_extraction_extracted_resume_version ?? -1) ===
      resumeVersion
  ) {
    logContactExtractionEvent("skip_idempotent", {
      candidate_id: candidateId,
      tenant_id: tenantId,
      resume_version: resumeVersion,
      status: priorStatus,
    });
    return {
      status: priorStatus,
      email: existing.email,
      phone: existing.phone,
      attempts: priorAttempts,
      error: null,
    };
  }

  const attempts = priorAttempts + 1;

  if (!force && !opts?.manualRetry && attempts > CONTACT_EXTRACTION_MAX_ATTEMPTS) {
    const error = "Maximum contact extraction attempts reached.";
    await sql`
      UPDATE candidates SET
        contact_extraction_status = ${"failed"},
        contact_extraction_error = ${error},
        contact_extraction_error_category = ${"max_attempts"},
        contact_extraction_completed_at = now(),
        contact_extracted_at = now(),
        updated_at = now()
      WHERE id = ${candidateId} AND tenant_id = ${tenantId}
    `;
    return {
      status: "failed",
      email: existing.email,
      phone: existing.phone,
      attempts: priorAttempts,
      error,
    };
  }

  logContactExtractionEvent("start", {
    candidate_id: candidateId,
    tenant_id: tenantId,
    workspace_id: opts?.workspaceId ?? null,
    attempt_number: attempts,
    file_type: opts?.fileType ?? null,
    resume_version: resumeVersion,
    parser_used: "regex_resume_text",
  });

  await sql`
    UPDATE candidates SET
      contact_extraction_status = ${"processing"},
      contact_extraction_started_at = now(),
      contact_extraction_error = ${null},
      contact_extraction_error_category = ${null},
      contact_extraction_attempts = ${attempts},
      contact_extraction_resume_version = ${resumeVersion},
      updated_at = now()
    WHERE id = ${candidateId} AND tenant_id = ${tenantId}
  `;

  try {
    const trimmed = (resumeText ?? "").trim();
    if (!trimmed) {
      // Prefer healing to completed when contacts already exist — never leave a
      // false "Failed" banner over valid email/phone.
      if (hasContactDetails(existing)) {
        await sql`
          UPDATE candidates SET
            contact_extraction_status = ${"completed"},
            contact_extraction_error = ${null},
            contact_extraction_error_category = ${null},
            contact_extraction_completed_at = now(),
            contact_extracted_at = COALESCE(contact_extracted_at, now()),
            contact_extraction_extracted_resume_version = ${resumeVersion},
            updated_at = now()
          WHERE id = ${candidateId} AND tenant_id = ${tenantId}
        `;
        logContactExtractionEvent("healed_completed", {
          candidate_id: candidateId,
          tenant_id: tenantId,
          attempt_number: attempts,
          resume_version: resumeVersion,
          result_status: "completed",
          failure_category: "empty_text",
          duration_ms: Date.now() - startedAt,
        });
        return {
          status: "completed",
          email: existing.email,
          phone: existing.phone,
          attempts,
          error: null,
        };
      }
      const category = "empty_text";
      const error = "No résumé text available for contact extraction.";
      await sql`
        UPDATE candidates SET
          contact_extraction_status = ${"failed"},
          contact_extraction_error = ${error},
          contact_extraction_error_category = ${category},
          contact_extraction_completed_at = now(),
          contact_extracted_at = now(),
          contact_extraction_extracted_resume_version = ${resumeVersion},
          updated_at = now()
        WHERE id = ${candidateId} AND tenant_id = ${tenantId}
      `;
      logContactExtractionEvent("failed", {
        candidate_id: candidateId,
        tenant_id: tenantId,
        attempt_number: attempts,
        resume_version: resumeVersion,
        file_type: opts?.fileType ?? null,
        result_status: "failed",
        failure_category: category,
        duration_ms: Date.now() - startedAt,
      });
      return {
        status: "failed",
        email: existing.email,
        phone: existing.phone,
        attempts,
        error,
      };
    }

    const extracted = extractContactsFromResumeText(trimmed);
    const allowEmail = canOverwriteContactWithResume(
      existing.email_source as ContactSource | null,
      force
    );
    const allowPhone = canOverwriteContactWithResume(
      existing.phone_source as ContactSource | null,
      force
    );

    const nextEmail = allowEmail
      ? extracted.email ??
        (force || isCorruptEmailValue(existing.email) ? null : existing.email)
      : existing.email;
    const nextPhone = allowPhone
      ? extracted.phone ??
        (force || isCorruptPhoneValue(existing.phone) ? null : existing.phone)
      : existing.phone;
    const nextEmailSource = allowEmail
      ? extracted.email
        ? "RESUME"
        : isCorruptEmailValue(existing.email)
          ? null
          : existing.email_source ?? null
      : existing.email_source ?? null;
    const nextPhoneSource = allowPhone
      ? extracted.phone
        ? "RESUME"
        : isCorruptPhoneValue(existing.phone)
          ? null
          : existing.phone_source ?? null
      : existing.phone_source ?? null;

    const status: ContactExtractionStatus = resolveTerminalContactStatus({
      email: nextEmail,
      phone: nextPhone,
    });

    await sql`
      UPDATE candidates SET
        email = ${nextEmail},
        phone = ${nextPhone},
        email_normalized = ${normalizeEmail(nextEmail)},
        phone_normalized = ${normalizePhone(nextPhone)},
        email_source = ${nextEmailSource},
        phone_source = ${nextPhoneSource},
        contact_extraction_status = ${status},
        contact_extraction_error = ${null},
        contact_extraction_error_category = ${null},
        contact_extraction_completed_at = now(),
        contact_extracted_at = now(),
        contact_extraction_extracted_resume_version = ${resumeVersion},
        updated_by_user_id = ${user.id},
        updated_at = now()
      WHERE id = ${candidateId} AND tenant_id = ${tenantId}
    `;

    logContactExtractionEvent("done", {
      candidate_id: candidateId,
      tenant_id: tenantId,
      workspace_id: opts?.workspaceId ?? null,
      attempt_number: attempts,
      resume_version: resumeVersion,
      file_type: opts?.fileType ?? null,
      parser_used: "regex_resume_text",
      result_status: status,
      has_email: Boolean(nextEmail),
      has_phone: Boolean(nextPhone),
      duration_ms: Date.now() - startedAt,
    });

    return {
      status,
      email: nextEmail,
      phone: nextPhone,
      attempts,
      error: null,
    };
  } catch (error) {
    const safeError = getSafeContactExtractionError(error);
    const category = classifyContactExtractionFailure(error, {
      fileType: opts?.fileType,
    });
    try {
      await sql`
        UPDATE candidates SET
          contact_extraction_status = ${"failed"},
          contact_extraction_error = ${safeError},
          contact_extraction_error_category = ${category},
          contact_extraction_completed_at = now(),
          contact_extracted_at = now(),
          updated_at = now()
        WHERE id = ${candidateId} AND tenant_id = ${tenantId}
      `;
    } catch {
      logContactExtractionEvent("failed", {
        candidate_id: candidateId,
        tenant_id: tenantId,
        attempt_number: attempts,
        failure_category: "database_update_failed",
        result_status: "failed",
        duration_ms: Date.now() - startedAt,
      });
    }
    logContactExtractionEvent("failed", {
      candidate_id: candidateId,
      tenant_id: tenantId,
      workspace_id: opts?.workspaceId ?? null,
      attempt_number: attempts,
      resume_version: resumeVersion,
      file_type: opts?.fileType ?? null,
      result_status: "failed",
      failure_category: category,
      duration_ms: Date.now() - startedAt,
    });
    return {
      status: "failed",
      email: existing.email,
      phone: existing.phone,
      attempts,
      error: safeError,
    };
  }
}

/** Mark stale queued/processing rows so UI never sticks on Extracting… */
export async function finalizeStaleContactExtractions(
  user: AppUser,
  candidateIds?: string[]
): Promise<number> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const cutoff = new Date(Date.now() - CONTACT_EXTRACTION_STALE_MS).toISOString();
  const ids = candidateIds?.filter(Boolean) ?? [];
  const rows = (await sql`
    UPDATE candidates SET
      contact_extraction_status = ${"stale"},
      contact_extraction_error = ${"Contact extraction timed out before completion."},
      contact_extraction_error_category = ${"timeout"},
      contact_extraction_completed_at = now(),
      contact_extracted_at = COALESCE(contact_extracted_at, now()),
      updated_at = now()
    WHERE tenant_id = ${tenantId}
      AND lower(COALESCE(contact_extraction_status, 'not_started')) IN (
        'pending', 'not_started', 'processing', 'not_processed', 'queued'
      )
      AND contact_extraction_started_at IS NOT NULL
      AND contact_extraction_started_at < ${cutoff}::timestamptz
      AND (
        ${ids.length === 0}::boolean
        OR id = ANY(${ids}::uuid[])
      )
    RETURNING id
  `) as Array<{ id: string }>;
  if (rows.length > 0) {
    logContactExtractionEvent("stale_finalized", {
      tenant_id: tenantId,
      count: rows.length,
      candidate_ids: rows.map((r) => r.id),
      failure_category: "timeout",
    });
  }
  return rows.length;
}

/**
 * Resolve legacy/stuck not_started rows for a workspace list:
 * - already has contact → completed
 * - has résumé text → extract now (capped)
 * - otherwise → failed (empty_text)
 */
export async function resolvePendingContactExtractions(
  user: AppUser,
  candidateIds: string[],
  opts?: { limit?: number; workspaceId?: string | null }
): Promise<void> {
  if (candidateIds.length === 0) return;
  await finalizeStaleContactExtractions(user, candidateIds);

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const limit = Math.max(1, Math.min(opts?.limit ?? 8, 20));
  const pending = (await sql`
    SELECT id, email, phone, extracted_resume_text, email_source, phone_source,
           contact_extraction_status, contact_extraction_attempts,
           COALESCE(contact_extraction_resume_version, 0) AS contact_extraction_resume_version
    FROM candidates
    WHERE tenant_id = ${tenantId}
      AND id = ANY(${candidateIds}::uuid[])
      AND lower(COALESCE(contact_extraction_status, 'not_started')) IN (
        'pending', 'not_started', 'not_processed'
      )
    LIMIT ${limit}
  `) as Array<{
    id: string;
    email: string | null;
    phone: string | null;
    extracted_resume_text: string | null;
    email_source: string | null;
    phone_source: string | null;
    contact_extraction_status: string | null;
    contact_extraction_attempts: number | null;
    contact_extraction_resume_version: number | null;
  }>;

  for (const row of pending) {
    if (hasContactDetails(row)) {
      await sql`
        UPDATE candidates SET
          contact_extraction_status = ${"completed"},
          contact_extraction_completed_at = COALESCE(contact_extraction_completed_at, now()),
          contact_extracted_at = COALESCE(contact_extracted_at, now()),
          contact_extraction_error = ${null},
          contact_extraction_error_category = ${null},
          updated_at = now()
        WHERE id = ${row.id} AND tenant_id = ${tenantId}
      `;
      continue;
    }
    const resume = row.extracted_resume_text?.trim() ?? "";
    if (!resume) {
      await sql`
        UPDATE candidates SET
          contact_extraction_status = ${"failed"},
          contact_extraction_completed_at = now(),
          contact_extracted_at = now(),
          contact_extraction_error = ${"No résumé text available for contact extraction."},
          contact_extraction_error_category = ${"empty_text"},
          updated_at = now()
        WHERE id = ${row.id} AND tenant_id = ${tenantId}
      `;
      continue;
    }
    await applyResumeContactExtraction(user, row.id, resume, {
      workspaceId: opts?.workspaceId,
      resumeVersion: Number(row.contact_extraction_resume_version ?? 0),
    });
  }
}

/**
 * Background contact extraction for the Candidates page / tenant backfill.
 * Claims eligible rows (idempotent: skips in-flight processing/queued), then extracts
 * from stored résumé text without blocking the list SSR path.
 */
export async function processEligibleContactExtractions(
  user: AppUser,
  opts?: {
    limit?: number;
    /** Prefer these visible IDs first (still capped by limit). */
    candidateIds?: string[];
  }
): Promise<{ processed: number; claimedIds: string[] }> {
  await finalizeStaleContactExtractions(user, opts?.candidateIds);
  await healFalseFailedContactExtractions(user, opts?.candidateIds);
  await queueCorruptContactRecordsForRepair(user, {
    limit: opts?.limit ?? 25,
    candidateIds: opts?.candidateIds,
  });

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const limit = Math.max(1, Math.min(opts?.limit ?? 25, 100));
  const preferIds = (opts?.candidateIds ?? []).filter(Boolean);
  const cutoff = new Date(Date.now() - CONTACT_EXTRACTION_STALE_MS).toISOString();
  const recentClaimCutoff = new Date(Date.now() - 15_000).toISOString();

  // Prefer visible IDs, then fill remaining with tenant-wide eligible rows.
  // Atomic claim skips currently processing and recently-queued rows (idempotent).
  const claimed = (await sql`
    WITH eligible AS (
      SELECT c.id, c.extracted_resume_text,
        COALESCE(c.contact_extraction_resume_version, 0) AS contact_extraction_resume_version,
        COALESCE(c.contact_extraction_attempts, 0) AS contact_extraction_attempts,
        c.contact_extraction_status,
        c.contact_extraction_completed_at,
        c.contact_extraction_error_category,
        CASE
          WHEN ${preferIds.length > 0}::boolean
           AND c.id = ANY(${preferIds}::uuid[])
          THEN 0
          ELSE 1
        END AS prefer_rank
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
        AND NULLIF(BTRIM(COALESCE(c.extracted_resume_text, '')), '') IS NOT NULL
        AND COALESCE(c.contact_extraction_attempts, 0) < ${CONTACT_EXTRACTION_MAX_ATTEMPTS}
        AND (
          lower(COALESCE(c.contact_extraction_status, 'not_started')) IN (
            'pending', 'not_started', 'not_processed'
          )
          OR (
            lower(c.contact_extraction_status) IN ('failed', 'stale')
            AND COALESCE(c.contact_extraction_attempts, 0) < ${CONTACT_EXTRACTION_MAX_ATTEMPTS}
          )
          OR (
            lower(c.contact_extraction_status) IN ('processing', 'queued')
            AND c.contact_extraction_started_at IS NOT NULL
            AND c.contact_extraction_started_at < ${cutoff}::timestamptz
          )
        )
        AND lower(COALESCE(c.contact_extraction_status, 'not_started')) NOT IN (
          'completed', 'not_found', 'extracted'
        )
        AND (
          NULLIF(BTRIM(COALESCE(c.email, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(c.phone, '')), '') IS NULL
          OR lower(COALESCE(c.contact_extraction_status, 'not_started')) IN (
            'pending', 'not_started', 'not_processed', 'failed', 'stale'
          )
        )
        AND (
          COALESCE(c.contact_extraction_extracted_resume_version, -1) IS DISTINCT FROM
            COALESCE(c.contact_extraction_resume_version, 0)
          OR lower(COALESCE(c.contact_extraction_status, 'not_started')) NOT IN (
            'completed', 'not_found'
          )
        )
      ORDER BY prefer_rank ASC, c.updated_at DESC
      LIMIT ${limit}
    )
    UPDATE candidates c SET
      contact_extraction_status = ${"queued"},
      contact_extraction_started_at = COALESCE(c.contact_extraction_started_at, now()),
      contact_extraction_error = ${null},
      updated_at = now()
    FROM eligible e
    WHERE c.id = e.id
      AND c.tenant_id = ${tenantId}
      AND (
        lower(COALESCE(c.contact_extraction_status, 'not_started')) NOT IN (
          'processing', 'queued'
        )
        OR (
          c.contact_extraction_started_at IS NOT NULL
          AND c.contact_extraction_started_at < ${cutoff}::timestamptz
        )
      )
      AND NOT (
        lower(COALESCE(c.contact_extraction_status, 'not_started')) = 'queued'
        AND c.contact_extraction_started_at IS NOT NULL
        AND c.contact_extraction_started_at >= ${recentClaimCutoff}::timestamptz
      )
    RETURNING c.id, c.extracted_resume_text,
      COALESCE(c.contact_extraction_resume_version, 0) AS contact_extraction_resume_version,
      COALESCE(c.contact_extraction_attempts, 0) AS contact_extraction_attempts,
      e.contact_extraction_status AS prior_status,
      e.contact_extraction_completed_at,
      e.contact_extraction_error_category
  `) as Array<{
    id: string;
    extracted_resume_text: string | null;
    contact_extraction_resume_version: number;
    contact_extraction_attempts: number;
    prior_status: string | null;
    contact_extraction_completed_at: string | null;
    contact_extraction_error_category: string | null;
  }>;

  const claimedIds: string[] = [];

  for (const row of claimed) {
    // Enforce auto-retry backoff for failed/stale rows.
    const normalized = normalizeContactExtractionStatus(row.prior_status);
    if (
      (normalized === "failed" || normalized === "stale") &&
      !canAutoRetryContactExtraction({
        status: normalized,
        attempts: row.contact_extraction_attempts,
        completedAt: row.contact_extraction_completed_at,
        errorCategory: row.contact_extraction_error_category,
      })
    ) {
      // Roll claim back to prior terminal status so another worker can wait.
      await sql`
        UPDATE candidates SET
          contact_extraction_status = ${normalized},
          updated_at = now()
        WHERE id = ${row.id} AND tenant_id = ${tenantId}
          AND lower(contact_extraction_status) = 'queued'
      `;
      continue;
    }

    claimedIds.push(row.id);
    logContactExtractionEvent("background_start", {
      candidate_id: row.id,
      tenant_id: tenantId,
      resume_version: row.contact_extraction_resume_version,
      attempt_number: Number(row.contact_extraction_attempts ?? 0) + 1,
    });
    await applyResumeContactExtraction(user, row.id, row.extracted_resume_text, {
      workspaceId: null,
      fileType: "stored-text",
      resumeVersion: row.contact_extraction_resume_version,
    });
  }

  logContactExtractionEvent("background_batch", {
    tenant_id: tenantId,
    processed: claimedIds.length,
    limit,
  });

  return { processed: claimedIds.length, claimedIds };
}

/**
 * Heal false-failed rows: when email AND phone already exist, status must be completed.
 * Also heal failed/stale rows that have at least one contact and no process error worth retrying as "failed UI".
 */
export async function healFalseFailedContactExtractions(
  user: AppUser,
  candidateIds?: string[]
): Promise<number> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const ids = candidateIds?.filter(Boolean) ?? [];
  const rows = (await sql`
    UPDATE candidates SET
      contact_extraction_status = ${"completed"},
      contact_extraction_error = ${null},
      contact_extraction_error_category = ${null},
      contact_extraction_completed_at = COALESCE(contact_extraction_completed_at, now()),
      contact_extracted_at = COALESCE(contact_extracted_at, now()),
      updated_at = now()
    WHERE tenant_id = ${tenantId}
      AND lower(COALESCE(contact_extraction_status, 'not_started')) IN (
        'failed', 'stale'
      )
      AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(phone, '')), '') IS NOT NULL
      AND email !~ '\\s'
      AND email ~ '@'
      AND email !~* '^[0-9]{7,}[a-z]'
      AND phone !~ '@'
      AND phone !~* '[a-z]'
      AND (
        ${ids.length === 0}::boolean
        OR id = ANY(${ids}::uuid[])
      )
    RETURNING id
  `) as Array<{ id: string }>;
  if (rows.length > 0) {
    logContactExtractionEvent("healed_false_failed", {
      tenant_id: tenantId,
      count: rows.length,
      candidate_ids: rows.map((r) => r.id),
    });
  }
  return rows.length;
}

/**
 * Queue candidates whose persisted email/phone looks corrupted
 * (phone+email glued, email+city glued, letters in phone, etc.) for re-extraction.
 */
export async function queueCorruptContactRecordsForRepair(
  user: AppUser,
  opts?: { limit?: number; candidateIds?: string[] }
): Promise<{ queued: number; claimedIds: string[] }> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const limit = Math.max(1, Math.min(opts?.limit ?? 40, 100));
  const preferIds = (opts?.candidateIds ?? []).filter(Boolean);

  // Heuristic SQL for obvious corruption; precise validation happens in retry.
  const claimed = (await sql`
    WITH eligible AS (
      SELECT c.id
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
        AND (
          ${preferIds.length === 0}::boolean
          OR c.id = ANY(${preferIds}::uuid[])
        )
        AND (
          (
            NULLIF(BTRIM(COALESCE(c.email, '')), '') IS NOT NULL
            AND (
              c.email ~ '\\s'
              OR c.email !~ '@'
              OR length(regexp_replace(c.email, '[^@]', '', 'g')) <> 1
              OR c.email ~* '^[0-9]{7,}[a-z]'
              OR c.email ~* '@[a-z0-9.-]+\\.(com|net|org|edu|io)[a-z]{3,}$'
              OR c.email ~* 'phone\\s*:'
            )
          )
          OR (
            NULLIF(BTRIM(COALESCE(c.phone, '')), '') IS NOT NULL
            AND (
              c.phone ~ '@'
              OR c.phone ~* '[a-z]'
              OR c.phone ~ '\\n'
            )
          )
        )
        AND lower(COALESCE(c.contact_extraction_status, 'not_started')) NOT IN (
          'queued', 'processing'
        )
      ORDER BY c.updated_at DESC
      LIMIT ${limit}
    )
    UPDATE candidates c SET
      contact_extraction_status = ${"failed"},
      contact_extraction_error = ${"Persisted contact value failed validation and needs re-extraction."},
      contact_extraction_error_category = ${"extraction_error"},
      contact_extraction_completed_at = now(),
      updated_at = now()
    FROM eligible e
    WHERE c.id = e.id AND c.tenant_id = ${tenantId}
    RETURNING c.id
  `) as Array<{ id: string }>;

  const claimedIds = claimed.map((r) => r.id);
  if (claimedIds.length > 0) {
    logContactExtractionEvent("corrupt_contacts_queued", {
      tenant_id: tenantId,
      count: claimedIds.length,
      candidate_ids: claimedIds,
    });
  }
  return { queued: claimedIds.length, claimedIds };
}

/**
 * Manual retry: re-read stored résumé file(s), re-extract text, then re-parse contacts.
 * Preserves MANUAL / MANUAL_CORRECTED / IMPORTED fields. Idempotent while queued/processing.
 */
export async function retryCandidateContactExtraction(
  user: AppUser,
  candidateId: string,
  opts?: { force?: boolean }
): Promise<{
  status: ContactExtractionStatus;
  email: string | null;
  phone: string | null;
  attempts: number;
  error: string | null;
  deduplicated: boolean;
  resumeReloaded: boolean;
  fileType: string | null;
}> {
  const existing = await getCandidate(user, candidateId);
  if (!existing) throw new AuthError("Candidate not found.", 404);

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const force = opts?.force ?? false;

  // Heal first if both contacts already exist.
  if (hasCompleteContactDetails(existing)) {
    await healFalseFailedContactExtractions(user, [candidateId]);
    return {
      status: "completed",
      email: existing.email,
      phone: existing.phone,
      attempts: Number(existing.contact_extraction_attempts ?? 0),
      error: null,
      deduplicated: true,
      resumeReloaded: false,
      fileType: null,
    };
  }

  // Idempotent claim
  const claimed = (await sql`
    UPDATE candidates SET
      contact_extraction_status = ${"queued"},
      contact_extraction_started_at = now(),
      contact_extraction_error = ${null},
      contact_extraction_error_category = ${null},
      contact_extraction_attempts = CASE
        WHEN ${force}::boolean THEN 0
        ELSE contact_extraction_attempts
      END,
      updated_at = now()
    WHERE id = ${candidateId}
      AND tenant_id = ${tenantId}
      AND (
        lower(COALESCE(contact_extraction_status, 'not_started')) NOT IN (
          'processing', 'queued'
        )
        OR contact_extraction_started_at IS NULL
        OR contact_extraction_started_at < now() - interval '2 minutes'
      )
    RETURNING id, contact_extraction_resume_version, contact_extraction_attempts
  `) as Array<{
    id: string;
    contact_extraction_resume_version: number | null;
    contact_extraction_attempts: number | null;
  }>;

  if (claimed.length === 0) {
    const current = await getCandidate(user, candidateId);
    return {
      status: normalizeContactExtractionStatus(current?.contact_extraction_status),
      email: current?.email ?? null,
      phone: current?.phone ?? null,
      attempts: Number(current?.contact_extraction_attempts ?? 0),
      error: null,
      deduplicated: true,
      resumeReloaded: false,
      fileType: null,
    };
  }

  const startedAt = Date.now();
  let resumeText = (existing.extracted_resume_text ?? "").trim();
  let fileType: string | null = "stored-text";
  let resumeReloaded = false;
  let failureCategory: string | null = null;
  let resumeId: string | null = null;

  try {
    const files = await getCandidateResumeFilesWithBytes(user, candidateId);
    if (files.length === 0 && !resumeText) {
      failureCategory = "resume_missing";
      throw new Error("No résumé file or text available for contact extraction.");
    }

    const textParts: string[] = [];
    for (const file of files) {
      resumeId = resumeId ?? file.id;
      fileType = file.fileType ?? fileType;
      if (file.bytes && file.bytes.length > 0) {
        try {
          const outcome = await extractFromUpload(
            file.bytes,
            file.fileName,
            file.isImage
          );
          if (outcome.text.trim()) {
            textParts.push(outcome.text.trim());
            resumeReloaded = true;
            fileType = file.fileType ?? fileType;
          } else if (file.extractedText?.trim()) {
            textParts.push(file.extractedText.trim());
          } else {
            failureCategory =
              file.fileType === "pdf"
                ? "pdf_parser_failed"
                : file.isImage
                  ? "ocr_failed"
                  : file.fileType === "docx" || file.fileType === "doc"
                    ? "docx_parser_failed"
                    : "empty_resume_text";
          }
        } catch {
          failureCategory = "resume_download_failed";
          if (file.extractedText?.trim()) {
            textParts.push(file.extractedText.trim());
          }
        }
      } else if (file.extractedText?.trim()) {
        textParts.push(file.extractedText.trim());
      }
    }

    if (textParts.length > 0) {
      resumeText = textParts.join("\n\n").trim();
    }

    if (!resumeText) {
      failureCategory = failureCategory ?? "empty_resume_text";
      throw new Error("Could not extract readable text from the stored résumé.");
    }

    // Persist refreshed résumé text when reloaded from files (does not bump retry attempts twice).
    if (resumeReloaded) {
      const nextVersion =
        Number(claimed[0].contact_extraction_resume_version ?? 0) + 1;
      await sql`
        UPDATE candidates SET
          extracted_resume_text = ${resumeText},
          contact_extraction_resume_version = ${nextVersion},
          updated_at = now()
        WHERE id = ${candidateId} AND tenant_id = ${tenantId}
      `;
    }

    const refreshed = await getCandidate(user, candidateId);
    const resumeVersion = Number(
      refreshed?.contact_extraction_resume_version ??
        claimed[0].contact_extraction_resume_version ??
        0
    );

    const result = await applyResumeContactExtraction(
      user,
      candidateId,
      resumeText,
      {
        force,
        manualRetry: true,
        resumeVersion,
        fileType,
      }
    );

    logContactExtractionEvent("manual_retry_done", {
      candidate_id: candidateId,
      tenant_id: tenantId,
      resume_id: resumeId,
      resume_version: resumeVersion,
      retry_attempt: result.attempts,
      file_type: fileType,
      parser: resumeReloaded ? "file_reparse+regex" : "stored_text+regex",
      duration_ms: Date.now() - startedAt,
      status: result.status,
      failure_category: result.error ? failureCategory : null,
      resume_reloaded: resumeReloaded,
    });

    return {
      ...result,
      deduplicated: false,
      resumeReloaded,
      fileType,
    };
  } catch (error) {
    const safeError = getSafeContactExtractionError(error);
    const category =
      failureCategory ??
      classifyContactExtractionFailure(error, { fileType });
    // If contacts already exist, heal instead of leaving Failed.
    const current = await getCandidate(user, candidateId);
    if (current && hasCompleteContactDetails(current)) {
      await healFalseFailedContactExtractions(user, [candidateId]);
      return {
        status: "completed",
        email: current.email,
        phone: current.phone,
        attempts: Number(current.contact_extraction_attempts ?? 0),
        error: null,
        deduplicated: false,
        resumeReloaded,
        fileType,
      };
    }
    await sql`
      UPDATE candidates SET
        contact_extraction_status = ${"failed"},
        contact_extraction_error = ${safeError},
        contact_extraction_error_category = ${category},
        contact_extraction_completed_at = now(),
        updated_at = now()
      WHERE id = ${candidateId} AND tenant_id = ${tenantId}
    `;
    logContactExtractionEvent("manual_retry_failed", {
      candidate_id: candidateId,
      tenant_id: tenantId,
      resume_id: resumeId,
      file_type: fileType,
      duration_ms: Date.now() - startedAt,
      status: "failed",
      failure_category: category,
    });
    return {
      status: "failed",
      email: current?.email ?? existing.email,
      phone: current?.phone ?? existing.phone,
      attempts: Number(current?.contact_extraction_attempts ?? existing.contact_extraction_attempts ?? 0),
      error: safeError,
      deduplicated: false,
      resumeReloaded,
      fileType,
    };
  }
}

/** Queue failed/stale candidates for batch retry (idempotent). */
export async function retryFailedContactExtractionsBatch(
  user: AppUser,
  opts?: { limit?: number; candidateIds?: string[] }
): Promise<{ queued: number; claimedIds: string[] }> {
  await healFalseFailedContactExtractions(user, opts?.candidateIds);
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const limit = Math.max(1, Math.min(opts?.limit ?? 25, 50));
  const preferIds = (opts?.candidateIds ?? []).filter(Boolean);

  const claimed = (await sql`
    WITH eligible AS (
      SELECT c.id
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
        AND lower(COALESCE(c.contact_extraction_status, 'not_started')) IN (
          'failed', 'stale'
        )
        AND (
          NULLIF(BTRIM(COALESCE(c.email, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(c.phone, '')), '') IS NULL
        )
        AND (
          NULLIF(BTRIM(COALESCE(c.extracted_resume_text, '')), '') IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM entity_files f
            WHERE f.entity_type = 'candidate' AND f.entity_id = c.id
          )
        )
        AND (
          ${preferIds.length === 0}::boolean
          OR c.id = ANY(${preferIds}::uuid[])
        )
      ORDER BY c.updated_at DESC
      LIMIT ${limit}
    )
    UPDATE candidates c SET
      contact_extraction_status = ${"queued"},
      contact_extraction_started_at = now(),
      contact_extraction_error = ${null},
      contact_extraction_error_category = ${null},
      updated_at = now()
    FROM eligible e
    WHERE c.id = e.id
      AND c.tenant_id = ${tenantId}
      AND lower(COALESCE(c.contact_extraction_status, 'not_started')) IN (
        'failed', 'stale'
      )
    RETURNING c.id
  `) as Array<{ id: string }>;

  const claimedIds: string[] = [];
  for (const row of claimed) {
    claimedIds.push(row.id);
    await retryCandidateContactExtraction(user, row.id, { force: false });
  }

  return { queued: claimedIds.length, claimedIds };
}

export interface CandidateDetailRow extends Candidate {
  status_name: string | null;
  status_color: string | null;
  assigned_recruiter_name: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  last_status_changed_by_name: string | null;
  notes_count: number;
}

export async function getCandidateDetail(
  user: AppUser,
  id: string
): Promise<CandidateDetailRow | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT
      c.*,
      cs.name AS status_name,
      cs.color AS status_color,
      COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
      COALESCE(cb.full_name, cb.email) AS created_by_name,
      COALESCE(ub.full_name, ub.email) AS updated_by_name,
      COALESCE(sb.full_name, sb.email) AS last_status_changed_by_name,
      (
        SELECT COUNT(*)::int FROM candidate_notes n
        WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
      ) AS notes_count
    FROM candidates c
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
    LEFT JOIN user_profiles cb ON cb.user_id = COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id)
    LEFT JOIN user_profiles ub ON ub.user_id = c.updated_by_user_id
    LEFT JOIN user_profiles sb ON sb.user_id = c.last_status_changed_by_user_id
    WHERE c.id = ${id} AND c.tenant_id = ${tenantId}
  `) as CandidateDetailRow[];
  return rows[0] ?? null;
}

export async function updateCandidateStatus(
  user: AppUser,
  candidateId: string,
  statusId: string,
  note?: string | null
): Promise<{
  changed: boolean;
  previousStatusName: string | null;
  newStatusName: string | null;
  statusId: string;
  changedAt: string;
  changedByName: string | null;
  note: string | null;
} | null> {
  const existing = await getCandidateDetail(user, candidateId);
  if (!existing) return null;

  const next = await getStatusById(user, statusId);
  if (!next || !next.is_active) {
    throw new AuthError("Invalid or inactive status.", 400);
  }

  const trimmedNote = note?.trim() || null;
  if (trimmedNote && trimmedNote.length > 4000) {
    throw new AuthError("Note must be 4000 characters or fewer.", 400);
  }

  if (existing.current_status_id === statusId) {
    return {
      changed: false,
      previousStatusName: existing.status_name,
      newStatusName: next.name,
      statusId,
      changedAt: existing.last_status_changed_at ?? existing.updated_at,
      changedByName: existing.last_status_changed_by_name,
      note: null,
    };
  }

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const metadata = buildStatusChangeMetadata({
    previousStatusId: existing.current_status_id,
    newStatusId: statusId,
    note: trimmedNote,
  });
  const changedAt = new Date().toISOString();
  const requestId = `status:${candidateId}:${statusId}:${changedAt}`;
  const source = sourceFromRole(user.role);

  const txResults = (await sql.transaction((tx) => [
    tx`
      UPDATE candidates SET
        current_status_id = ${statusId},
        last_status_changed_by_user_id = ${user.id},
        last_status_changed_at = ${changedAt}::timestamptz,
        updated_by_user_id = ${user.id},
        updated_at = now()
      WHERE id = ${candidateId} AND tenant_id = ${tenantId}
      RETURNING last_status_changed_at
    `,
    tx`
      INSERT INTO candidate_activity_logs (
        tenant_id, candidate_id, job_id, performed_by_user_id,
        action_type, previous_value, new_value, metadata,
        request_id, source, analysis_id, note_id, action_label
      ) VALUES (
        ${tenantId},
        ${candidateId},
        ${null},
        ${user.id},
        ${"STATUS_CHANGED"},
        ${existing.status_name},
        ${next.name},
        ${JSON.stringify(metadata)},
        ${requestId},
        ${source},
        ${null},
        ${null},
        ${null}
      )
      ON CONFLICT (tenant_id, request_id)
      DO NOTHING
      RETURNING id
    `,
  ])) as Array<Array<{ last_status_changed_at?: string; id?: string }>>;

  const updated = txResults[0]?.[0];
  const statusChangedAt =
    (updated?.last_status_changed_at as string | undefined) ?? changedAt;

  const semantic = mapStatusNameToActivityType(next.name);
  if (semantic) {
    await logCandidateActivity({
      tenantId,
      candidateId,
      performedByUserId: user.id,
      actionType: semantic,
      previousValue: existing.status_name,
      newValue: next.name,
      metadata: {
        previous_status_id: existing.current_status_id,
        new_status_id: statusId,
        derived_from: "STATUS_CHANGED",
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
      actorRole: user.role,
      requestId: `status-semantic:${candidateId}:${statusId}:${statusChangedAt}`,
    });
  }
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: candidateId,
    action: "STATUS_CHANGED",
    previousValue: { status_id: existing.current_status_id, name: existing.status_name },
    newValue: {
      status_id: statusId,
      name: next.name,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    },
  });

  return {
    changed: true,
    previousStatusName: existing.status_name,
    newStatusName: next.name,
    statusId,
    changedAt: statusChangedAt,
    changedByName: user.name,
    note: trimmedNote,
  };
}

export async function assignCandidateRecruiter(
  user: AppUser,
  candidateId: string,
  recruiterUserId: string | null
): Promise<{
  changed: boolean;
  previousRecruiterName: string | null;
  newRecruiterName: string | null;
} | null> {
  const existing = await getCandidateDetail(user, candidateId);
  if (!existing) return null;

  if (existing.assigned_recruiter_id === recruiterUserId) {
    return {
      changed: false,
      previousRecruiterName: existing.assigned_recruiter_name,
      newRecruiterName: existing.assigned_recruiter_name,
    };
  }

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  let newName: string | null = null;

  if (recruiterUserId) {
    const recruiters = (await sql`
      SELECT user_id, COALESCE(full_name, email) AS name
      FROM user_profiles
      WHERE user_id = ${recruiterUserId}
        AND tenant_id = ${tenantId}
        AND status = 'ACTIVE'
    `) as { user_id: string; name: string | null }[];
    if (!recruiters[0]) {
      throw new AuthError("Assigned recruiter must belong to this tenant.", 400);
    }
    newName = recruiters[0].name;
  }

  await sql`
    UPDATE candidates SET
      assigned_recruiter_id = ${recruiterUserId},
      updated_by_user_id = ${user.id},
      updated_at = now()
    WHERE id = ${candidateId} AND tenant_id = ${tenantId}
  `;

  await logCandidateActivity({
    tenantId,
    candidateId,
    performedByUserId: user.id,
    actionType: existing.assigned_recruiter_id ? "CANDIDATE_REASSIGNED" : "CANDIDATE_ASSIGNED",
    previousValue: existing.assigned_recruiter_name,
    newValue: newName ?? "Unassigned",
    metadata: {
      previous_recruiter_id: existing.assigned_recruiter_id,
      new_recruiter_id: recruiterUserId,
    },
    actorRole: user.role,
    requestId: `assign:${candidateId}:${recruiterUserId ?? "none"}:${Date.now()}`,
  });
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: candidateId,
    action: "CANDIDATE_ASSIGNED",
    previousValue: { recruiter_id: existing.assigned_recruiter_id },
    newValue: { recruiter_id: recruiterUserId },
  });

  return {
    changed: true,
    previousRecruiterName: existing.assigned_recruiter_name,
    newRecruiterName: newName,
  };
}

export async function attachCandidateToWorkspace(
  user: AppUser,
  workspaceId: string,
  candidateId: string,
  status: CandidatePipelineStatus
): Promise<string> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    INSERT INTO job_match_candidates (workspace_id, candidate_id, owner_user_id, status)
    VALUES (${workspaceId}, ${candidateId}, ${user.id}, ${status})
    ON CONFLICT (workspace_id, candidate_id)
    DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    RETURNING id
  `) as { id: string }[];
  await sql`
    UPDATE job_match_candidates
    SET owner_user_id = ${user.id}
    WHERE id = ${rows[0].id}
      AND EXISTS (
        SELECT 1 FROM job_match_workspaces w
        WHERE w.id = ${workspaceId} AND w.tenant_id = ${tenantId}
      )
  `;
  await logCandidateActivity({
    tenantId,
    candidateId,
    jobId: workspaceId,
    performedByUserId: user.id,
    actionType: "CANDIDATE_ADDED_TO_JOB",
    newValue: workspaceId,
    actorRole: user.role,
    requestId: `job-link:${workspaceId}:${candidateId}:${rows[0].id}`,
  });
  return rows[0].id;
}

export async function getJobCandidate(
  user: AppUser,
  workspaceId: string,
  candidateId: string
): Promise<{
  id: string;
  status: CandidatePipelineStatus;
  latest_analysis_id: string | null;
  updated_at: string;
} | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT jmc.id, jmc.status, jmc.latest_analysis_id, jmc.updated_at
    FROM job_match_candidates jmc
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidates c ON c.id = jmc.candidate_id
    WHERE jmc.workspace_id = ${workspaceId}
      AND jmc.candidate_id = ${candidateId}
      AND w.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
  `) as Array<{
    id: string;
    status: CandidatePipelineStatus;
    latest_analysis_id: string | null;
    updated_at: string;
  }>;
  return rows[0] ?? null;
}

/** Release an ANALYZING lock after a crash, timeout, or explicit retry. */
export async function releaseAnalyzingLock(
  user: AppUser,
  jobMatchCandidateId: string,
  options: { force?: boolean; staleAfterMs?: number } = {}
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const staleAfterMs = options.staleAfterMs ?? 5 * 60 * 1000;

  if (options.force) {
    const rows = (await sql`
      UPDATE job_match_candidates
      SET status = 'FAILED', updated_at = now()
      WHERE id = ${jobMatchCandidateId}
        AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
        AND status = 'ANALYZING'
      RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  const rows = (await sql`
    UPDATE job_match_candidates
    SET status = 'FAILED', updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
      AND status = 'ANALYZING'
      AND updated_at < now() - (${staleAfterMs} * interval '1 millisecond')
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

/** Release a stuck resume-update / reanalyze lock after crash, timeout, or retry. */
export async function releaseResumeUpdateLock(
  user: AppUser,
  jobMatchCandidateId: string,
  options: { force?: boolean; staleAfterMs?: number } = {}
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const staleAfterMs = options.staleAfterMs ?? 5 * 60 * 1000;

  if (options.force) {
    const rows = (await sql`
      UPDATE job_match_candidates
      SET status = 'UPDATE_FAILED', updated_at = now()
      WHERE id = ${jobMatchCandidateId}
        AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
        AND status IN (
          'UPDATE_PENDING',
          'EXTRACTING_UPDATED_RESUME',
          'REANALYZING',
          'VALIDATING',
          'SAVING',
          'ANALYZING'
        )
      RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  const rows = (await sql`
    UPDATE job_match_candidates
    SET status = 'UPDATE_FAILED', updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
      AND status IN (
        'UPDATE_PENDING',
        'EXTRACTING_UPDATED_RESUME',
        'REANALYZING',
        'VALIDATING',
        'SAVING',
        'ANALYZING'
      )
      AND updated_at < now() - (${staleAfterMs} * interval '1 millisecond')
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function setJobCandidateStatus(
  user: AppUser,
  jobMatchCandidateId: string,
  status: CandidatePipelineStatus
): Promise<void> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  await sql`
    UPDATE job_match_candidates SET status = ${status}, updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
  `;
}

export async function setLatestAnalysis(
  user: AppUser,
  jobMatchCandidateId: string,
  analysisId: string
): Promise<void> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  await sql`
    UPDATE job_match_candidates
    SET latest_analysis_id = ${analysisId}, status = 'ANALYZED', updated_at = now()
    WHERE id = ${jobMatchCandidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
  `;
}

export async function removeCandidateFromJob(
  user: AppUser,
  workspaceId: string,
  candidateId: string
): Promise<boolean> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    DELETE FROM job_match_candidates
    WHERE workspace_id = ${workspaceId} AND candidate_id = ${candidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
    RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return false;
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate",
    entityId: candidateId,
    action: "CANDIDATE_REMOVED_FROM_JOB",
    newValue: { workspaceId },
  });
  return true;
}

export interface DashboardCandidateRow {
  candidate_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  location: string | null;
  workspace_id: string | null;
  job_title: string | null;
  job_code: string | null;
  match_score: number | null;
  match_category: string | null;
  submission_readiness: string | null;
  updated_at: string;
  current_status_id: string | null;
  status_name: string | null;
  status_color: string | null;
  assigned_recruiter_id: string | null;
  assigned_recruiter_name: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  notes_count: number;
  contact_extraction_status: string | null;
  contact_extraction_started_at: string | null;
  contact_extraction_completed_at: string | null;
  contact_extraction_error: string | null;
  contact_extraction_attempts: number;
}

export interface DashboardCandidateFilters {
  matchCategory?: string;
  submissionReadiness?: string;
  statusId?: string;
  assignedRecruiterId?: string | null;
  createdByUserId?: string;
  updatedByUserId?: string;
  workspaceId?: string;
  dateFrom?: string;
  dateTo?: string;
  mine?: boolean;
  /** Free-text search (name, job, status, recruiter; contact when allowed). */
  search?: string;
  /** When false, email/phone are excluded from search matching. */
  searchContact?: boolean;
}

/**
 * Candidates for the dashboard list page. When a match filter is set, returns
 * job-match rows whose latest analysis matches the dashboard statistic.
 */
export async function listDashboardCandidates(
  user: AppUser,
  opts?: DashboardCandidateFilters
): Promise<DashboardCandidateRow[]> {
  // Heal false "Failed" rows that already have both email and phone.
  try {
    await healFalseFailedContactExtractions(user);
    await queueCorruptContactRecordsForRepair(user, { limit: 25 });
  } catch {
    /* listing must not fail on heal */
  }

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const matchCategory = opts?.matchCategory ?? null;
  const submissionReadiness = opts?.submissionReadiness ?? null;
  const statusId = opts?.statusId ?? null;
  const assignedRecruiterId =
    opts?.mine ? user.id : (opts?.assignedRecruiterId ?? null);
  const unassignedOnly = opts?.assignedRecruiterId === null && !opts?.mine;
  const createdByUserId = opts?.createdByUserId ?? null;
  const updatedByUserId = opts?.updatedByUserId ?? null;
  const workspaceId = opts?.workspaceId ?? null;
  const dateFrom = opts?.dateFrom ?? null;
  const dateTo = opts?.dateTo ?? null;
  const searchPattern = toCandidateSearchPattern(opts?.search);
  const phoneDigitsPattern = toPhoneDigitsSearchPattern(opts?.search);
  const searchContact = opts?.searchContact !== false;
  const analysisFiltered = Boolean(matchCategory || submissionReadiness);

  if (!analysisFiltered) {
    const rows = (await sql`
      SELECT
        c.id AS candidate_id,
        c.full_name,
        c.email,
        c.phone,
        c.specialty,
        c.location,
        (
          SELECT jmc.workspace_id
          FROM job_match_candidates jmc
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS workspace_id,
        (
          SELECT w.job_title
          FROM job_match_candidates jmc
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS job_title,
        (
          SELECT w.job_ref
          FROM job_match_candidates jmc
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS job_code,
        (
          SELECT a.overall_match_score
          FROM job_match_candidates jmc
          LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS match_score,
        (
          SELECT a.match_category
          FROM job_match_candidates jmc
          LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS match_category,
        (
          SELECT a.submission_readiness
          FROM job_match_candidates jmc
          LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
          JOIN job_match_workspaces w ON w.id = jmc.workspace_id
          WHERE jmc.candidate_id = c.id AND w.tenant_id = ${tenantId}
          ORDER BY jmc.updated_at DESC
          LIMIT 1
        ) AS submission_readiness,
        c.updated_at,
        c.current_status_id,
        cs.name AS status_name,
        cs.color AS status_color,
        c.assigned_recruiter_id,
        COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
        c.updated_by_user_id,
        COALESCE(ub.full_name, ub.email) AS updated_by_name,
        COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) AS created_by_user_id,
        COALESCE(cb.full_name, cb.email) AS created_by_name,
        (
          SELECT COUNT(*)::int FROM candidate_notes n
          WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
        ) AS notes_count,
        c.contact_extraction_status,
        c.contact_extraction_started_at,
        c.contact_extraction_completed_at,
        c.contact_extraction_error,
        COALESCE(c.contact_extraction_attempts, 0) AS contact_extraction_attempts
      FROM candidates c
      LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
      LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
      LEFT JOIN user_profiles ub ON ub.user_id = c.updated_by_user_id
      LEFT JOIN user_profiles cb ON cb.user_id = COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id)
      WHERE c.tenant_id = ${tenantId}
        AND (${statusId}::uuid IS NULL OR c.current_status_id = ${statusId}::uuid)
        AND (
          ${unassignedOnly} = false
          OR c.assigned_recruiter_id IS NULL
        )
        AND (
          ${assignedRecruiterId}::uuid IS NULL
          OR c.assigned_recruiter_id = ${assignedRecruiterId}::uuid
        )
        AND (
          ${createdByUserId}::uuid IS NULL
          OR COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) = ${createdByUserId}::uuid
        )
        AND (
          ${updatedByUserId}::uuid IS NULL
          OR c.updated_by_user_id = ${updatedByUserId}::uuid
        )
        AND (
          ${workspaceId}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM job_match_candidates jmc
            WHERE jmc.candidate_id = c.id AND jmc.workspace_id = ${workspaceId}::uuid
          )
        )
        AND (${dateFrom}::timestamptz IS NULL OR c.updated_at >= ${dateFrom}::timestamptz)
        AND (${dateTo}::timestamptz IS NULL OR c.updated_at <= ${dateTo}::timestamptz)
        AND (
          ${searchPattern}::text IS NULL
          OR c.full_name ILIKE ${searchPattern}
          OR COALESCE(c.normalized_full_name, '') ILIKE ${searchPattern}
          OR (
            ${searchContact} = true
            AND (
              COALESCE(c.email, '') ILIKE ${searchPattern}
              OR COALESCE(c.email_normalized, '') ILIKE ${searchPattern}
              OR COALESCE(c.phone, '') ILIKE ${searchPattern}
              OR (
                ${phoneDigitsPattern}::text IS NOT NULL
                AND regexp_replace(
                  COALESCE(c.phone_normalized, c.phone, ''),
                  '[^0-9]',
                  '',
                  'g'
                ) LIKE ${phoneDigitsPattern}
              )
            )
          )
          OR COALESCE(cs.name, '') ILIKE ${searchPattern}
          OR COALESCE(ar.full_name, ar.email, '') ILIKE ${searchPattern}
          OR EXISTS (
            SELECT 1
            FROM job_match_candidates jmc_s
            JOIN job_match_workspaces w_s ON w_s.id = jmc_s.workspace_id
            WHERE jmc_s.candidate_id = c.id
              AND w_s.tenant_id = ${tenantId}
              AND (
                COALESCE(w_s.job_title, '') ILIKE ${searchPattern}
                OR COALESCE(w_s.job_ref, '') ILIKE ${searchPattern}
              )
          )
        )
      ORDER BY c.updated_at DESC
    `) as DashboardCandidateRow[];
    return redactCandidateContact(rows, user.role);
  }

  const rows = (await sql`
    SELECT
      c.id AS candidate_id,
      c.full_name,
      c.email,
      c.phone,
      c.specialty,
      c.location,
      jmc.workspace_id,
      w.job_title,
      w.job_ref AS job_code,
      a.overall_match_score AS match_score,
      a.match_category,
      a.submission_readiness,
      jmc.updated_at,
      c.current_status_id,
      cs.name AS status_name,
      cs.color AS status_color,
      c.assigned_recruiter_id,
      COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
      c.updated_by_user_id,
      COALESCE(ub.full_name, ub.email) AS updated_by_name,
      COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) AS created_by_user_id,
      COALESCE(cb.full_name, cb.email) AS created_by_name,
      (
        SELECT COUNT(*)::int FROM candidate_notes n
        WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
      ) AS notes_count,
      c.contact_extraction_status,
      c.contact_extraction_started_at,
      c.contact_extraction_completed_at,
      c.contact_extraction_error,
      COALESCE(c.contact_extraction_attempts, 0) AS contact_extraction_attempts
    FROM job_match_candidates jmc
    JOIN candidates c ON c.id = jmc.candidate_id
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
    LEFT JOIN user_profiles ub ON ub.user_id = c.updated_by_user_id
    LEFT JOIN user_profiles cb ON cb.user_id = COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id)
    WHERE w.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
      AND (${matchCategory}::text IS NULL OR a.match_category = ${matchCategory})
      AND (${submissionReadiness}::text IS NULL OR a.submission_readiness = ${submissionReadiness})
      AND (${statusId}::uuid IS NULL OR c.current_status_id = ${statusId}::uuid)
      AND (
        ${unassignedOnly} = false
        OR c.assigned_recruiter_id IS NULL
      )
      AND (
        ${assignedRecruiterId}::uuid IS NULL
        OR c.assigned_recruiter_id = ${assignedRecruiterId}::uuid
      )
      AND (
        ${createdByUserId}::uuid IS NULL
        OR COALESCE(c.created_by_user_id, c.created_by, c.owner_user_id) = ${createdByUserId}::uuid
      )
      AND (
        ${updatedByUserId}::uuid IS NULL
        OR c.updated_by_user_id = ${updatedByUserId}::uuid
      )
      AND (${workspaceId}::uuid IS NULL OR jmc.workspace_id = ${workspaceId}::uuid)
      AND (${dateFrom}::timestamptz IS NULL OR c.updated_at >= ${dateFrom}::timestamptz)
      AND (${dateTo}::timestamptz IS NULL OR c.updated_at <= ${dateTo}::timestamptz)
      AND (
        ${searchPattern}::text IS NULL
        OR c.full_name ILIKE ${searchPattern}
        OR COALESCE(c.normalized_full_name, '') ILIKE ${searchPattern}
        OR (
          ${searchContact} = true
          AND (
            COALESCE(c.email, '') ILIKE ${searchPattern}
            OR COALESCE(c.email_normalized, '') ILIKE ${searchPattern}
            OR COALESCE(c.phone, '') ILIKE ${searchPattern}
            OR (
              ${phoneDigitsPattern}::text IS NOT NULL
              AND regexp_replace(
                COALESCE(c.phone_normalized, c.phone, ''),
                '[^0-9]',
                '',
                'g'
              ) LIKE ${phoneDigitsPattern}
            )
          )
        )
        OR COALESCE(cs.name, '') ILIKE ${searchPattern}
        OR COALESCE(ar.full_name, ar.email, '') ILIKE ${searchPattern}
        OR COALESCE(w.job_title, '') ILIKE ${searchPattern}
        OR COALESCE(w.job_ref, '') ILIKE ${searchPattern}
      )
    ORDER BY a.overall_match_score DESC NULLS LAST, c.full_name ASC
  `) as DashboardCandidateRow[];
  return redactCandidateContact(rows, user.role);
}

function redactCandidateContact(
  rows: DashboardCandidateRow[],
  role: AppUser["role"]
): DashboardCandidateRow[] {
  return rows.map((row) => {
    const base: DashboardCandidateRow = {
      ...row,
      contact_extraction_status: row.contact_extraction_status ?? "not_started",
      contact_extraction_started_at: row.contact_extraction_started_at ?? null,
      contact_extraction_completed_at: row.contact_extraction_completed_at ?? null,
      contact_extraction_error: row.contact_extraction_error ?? null,
      contact_extraction_attempts: Number(row.contact_extraction_attempts ?? 0),
    };
    if (canViewCandidateContact(role)) return base;
    return {
      ...base,
      email: null,
      phone: null,
      contact_extraction_error: null,
    };
  });
}

// Resolves a workspace this candidate belongs to (used when the detail page is
// opened without an explicit workspace query).
export async function getPrimaryWorkspaceId(
  user: AppUser,
  candidateId: string
): Promise<string | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT workspace_id FROM job_match_candidates
    WHERE candidate_id = ${candidateId}
      AND workspace_id IN (SELECT id FROM job_match_workspaces WHERE tenant_id = ${tenantId})
    ORDER BY created_at ASC LIMIT 1
  `) as { workspace_id: string }[];
  return rows[0]?.workspace_id ?? null;
}

// Ranking table rows for a workspace (spec §10), sorted best-first.
export async function listWorkspaceCandidates(
  user: AppUser,
  workspaceId: string
): Promise<RankedCandidateRow[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);

  // Resolve stuck/legacy pending contact extraction before returning rows.
  // Never let recovery failures take down the ranking page.
  try {
    const pendingIds = (await sql`
      SELECT c.id
      FROM job_match_candidates jmc
      JOIN candidates c ON c.id = jmc.candidate_id
      JOIN job_match_workspaces w ON w.id = jmc.workspace_id
      WHERE jmc.workspace_id = ${workspaceId}
        AND w.tenant_id = ${tenantId}
        AND c.tenant_id = ${tenantId}
        AND lower(COALESCE(c.contact_extraction_status, 'pending')) IN (
          'pending', 'not_started', 'processing', 'not_processed', 'queued', 'stale'
        )
    `) as Array<{ id: string }>;
    if (pendingIds.length > 0) {
      await resolvePendingContactExtractions(
        user,
        pendingIds.map((r) => r.id),
        { workspaceId, limit: 12 }
      );
    }
  } catch (err) {
    console.error("[contact-extract] list recovery failed", {
      workspaceId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const rows = (await sql`
    SELECT
      jmc.id AS job_match_candidate_id,
      jmc.candidate_id,
      c.full_name,
      c.full_name AS candidate_name,
      w.job_ref AS job_code,
      c.phone AS phone_number,
      c.email,
      c.contact_extraction_status,
      c.contact_extraction_started_at,
      c.contact_extraction_completed_at,
      c.contact_extraction_error,
      c.contact_extraction_attempts,
      jmc.status,
      jmc.latest_analysis_id,
      a.overall_match_score AS match_score,
      a.match_category,
      a.submission_readiness,
      a.recommended_action,
      a.confidence_score,
      a.created_at AS analyzed_at,
      a.ai_provider,
      COALESCE(a.ai_model, a.model_name) AS ai_model,
      jmc.updated_at,
      d.disposition,
      c.current_status_id,
      cs.name AS status_name,
      cs.color AS status_color,
      COALESCE(sb.full_name, sb.email) AS last_status_changed_by_name,
      c.last_status_changed_at,
      COALESCE(ar.full_name, ar.email) AS assigned_recruiter_name,
      (
        SELECT COUNT(*)::int FROM candidate_notes n
        WHERE n.candidate_id = c.id AND n.tenant_id = c.tenant_id AND n.deleted_at IS NULL
      ) AS notes_count,
      (SELECT COUNT(*) FROM candidate_match_requirements r
        WHERE r.analysis_id = a.id AND r.requirement_type = 'MANDATORY'
          AND r.requirement_outcome = 'MET') AS mandatory_confirmed,
      (SELECT COUNT(*) FROM candidate_match_requirements r
        WHERE r.analysis_id = a.id AND r.requirement_type = 'MANDATORY'
          AND r.requirement_outcome IN ('VERIFY', 'CONFLICT')) AS mandatory_verify,
      (SELECT COUNT(*) FROM candidate_match_requirements r
        WHERE r.analysis_id = a.id AND r.requirement_type = 'MANDATORY'
          AND r.requirement_outcome = 'NOT_MET') AS mandatory_not_met
    FROM job_match_candidates jmc
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    JOIN candidates c ON c.id = jmc.candidate_id
    LEFT JOIN candidate_match_analyses a ON a.id = jmc.latest_analysis_id
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    LEFT JOIN user_profiles sb ON sb.user_id = c.last_status_changed_by_user_id
    LEFT JOIN user_profiles ar ON ar.user_id = c.assigned_recruiter_id
    LEFT JOIN LATERAL (
      SELECT disposition FROM recruiter_dispositions rd
      WHERE rd.candidate_id = jmc.candidate_id AND rd.workspace_id = jmc.workspace_id
      ORDER BY created_at DESC LIMIT 1
    ) d ON true
    WHERE jmc.workspace_id = ${workspaceId}
      AND w.tenant_id = ${tenantId}
      AND c.tenant_id = ${tenantId}
    ORDER BY a.overall_match_score DESC NULLS LAST, c.full_name ASC
  `) as Array<Record<string, unknown>>;

  const canViewContact = canViewCandidateContact(user.role);

  return rows.map((r) => {
    const fullName = (r.full_name as string) ?? null;
    const email = canViewContact ? ((r.email as string) ?? null) : null;
    const phone = canViewContact
      ? ((r.phone_number as string) ?? null)
      : null;
    return {
      job_match_candidate_id: r.job_match_candidate_id as string,
      candidate_id: r.candidate_id as string,
      full_name: fullName,
      candidate_name: (r.candidate_name as string) ?? fullName,
      job_code: (r.job_code as string) ?? null,
      phone_number: phone,
      email,
      can_view_contact: canViewContact,
      contact_extraction_status:
        (r.contact_extraction_status as string) ?? "not_started",
      contact_extraction_started_at:
        (r.contact_extraction_started_at as string) ?? null,
      contact_extraction_completed_at:
        (r.contact_extraction_completed_at as string) ?? null,
      contact_extraction_error: canViewContact
        ? ((r.contact_extraction_error as string) ?? null)
        : null,
      contact_extraction_attempts: Number(r.contact_extraction_attempts ?? 0),
      status: r.status as CandidatePipelineStatus,
      latest_analysis_id: (r.latest_analysis_id as string) ?? null,
      match_score: num(r.match_score),
      match_category: (r.match_category as string) ?? null,
      submission_readiness: (r.submission_readiness as string) ?? null,
      recommended_action: (r.recommended_action as string) ?? null,
      confidence_score: num(r.confidence_score),
      mandatory_confirmed: num(r.mandatory_confirmed),
      mandatory_verify: num(r.mandatory_verify),
      mandatory_not_met: num(r.mandatory_not_met),
      disposition: (r.disposition as string) ?? null,
      analyzed_at: (r.analyzed_at as string) ?? null,
      updated_at: r.updated_at as string,
      ai_provider: (r.ai_provider as string) ?? null,
      ai_model: (r.ai_model as string) ?? null,
      current_status_id: (r.current_status_id as string) ?? null,
      status_name: (r.status_name as string) ?? null,
      status_color: (r.status_color as string) ?? null,
      last_status_changed_by_name: (r.last_status_changed_by_name as string) ?? null,
      last_status_changed_at: (r.last_status_changed_at as string) ?? null,
      assigned_recruiter_name: (r.assigned_recruiter_name as string) ?? null,
      notes_count: Number(r.notes_count ?? 0),
    };
  });
}
