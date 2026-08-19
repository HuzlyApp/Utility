import "server-only";

import { getSql } from "./client";
import { audit } from "./audit";
import { logCandidateActivity } from "./activity";
import { getWorkspace } from "./workspaces";
import { listCandidateStatuses } from "./statuses";
import { AuthError, type AppUser } from "@/lib/auth/session";
import {
  sanitizeJobSearchTerm,
  toCandidateSearchPattern,
} from "@/lib/candidate-crm";
import {
  IMPORT_MATCH_FETCH_CAP,
  IMPORT_MAX_IDS_PER_REQUEST,
  IMPORT_PAGE_SIZE_DEFAULT,
  IMPORT_PAGE_SIZE_MAX,
  IMPORT_RECOMMENDED_MIN_SCORE,
  experienceBucket,
  extractExperienceHighlights,
  isImportCandidateUuid,
  jobProfileFromWorkspace,
  parseCommaList,
  phrasePresent,
  scoreCandidateAgainstJob,
  type ImportCandidateView,
  type JobMatchProfile,
} from "@/lib/candidate-import-match";
import type { CandidatePipelineStatus } from "./types";

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

export type ImportSearchTab = "recommended" | "all";
export type ImportExperienceFilter = "under3" | "3to5" | "5to10" | "10plus";

export interface ImportSearchFilters {
  tab?: ImportSearchTab;
  search?: string;
  page?: number;
  pageSize?: number;
  minMatch?: number;
  role?: string;
  skills?: string[];
  tags?: string[];
  location?: string;
  experience?: ImportExperienceFilter | "";
  statusId?: string;
  previousTitle?: string;
}

export interface ImportSearchResult {
  candidates: ImportCandidateView[];
  total: number;
  allTotal: number;
  recommendedTotal: number;
  page: number;
  pageSize: number;
  truncated: boolean;
  job: { id: string; title: string; jobRef: string | null };
  suggestedTags: string[];
  suggestedSkills: string[];
  suggestedRoles: string[];
  facets: {
    locations: string[];
    roles: string[];
    statuses: Array<{ id: string; name: string }>;
  };
}

interface ImportSqlRow {
  id: string;
  full_name: string | null;
  specialty: string | null;
  location: string | null;
  resume_excerpt: string | null;
  recruiter_notes: string | null;
  verified_information: Record<string, unknown> | null;
  status_name: string | null;
  status_color: string | null;
  already_added: boolean;
  current_role: string | null;
  previous_titles: string[] | null;
}

function toIlikePattern(value: string | null | undefined): string | null {
  const cleaned = sanitizeJobSearchTerm(value ?? "");
  if (!cleaned) return null;
  return `%${cleaned}%`;
}

function recommendPatterns(job: JobMatchProfile): string[] {
  const phrases = [job.title, job.specialty, job.location, ...job.tags.slice(0, 6)];
  const tokens = job.keywords.slice(0, 8);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...phrases, ...tokens]) {
    const cleaned = sanitizeJobSearchTerm(raw);
    if (cleaned.length < 3) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`%${cleaned}%`);
    if (out.length >= 12) break;
  }
  return out;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function searchCandidatesForImport(
  user: AppUser,
  workspaceId: string,
  filters: ImportSearchFilters = {}
): Promise<ImportSearchResult> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const ws = await getWorkspace(user, workspaceId);
  if (!ws) throw new AuthError("Workspace not found.", 404);

  const job = jobProfileFromWorkspace(ws);
  const tab: ImportSearchTab = filters.tab === "all" ? "all" : "recommended";
  const pageSize = Math.min(
    IMPORT_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(filters.pageSize ?? IMPORT_PAGE_SIZE_DEFAULT))
  );
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const minMatch =
    typeof filters.minMatch === "number" && Number.isFinite(filters.minMatch)
      ? Math.max(0, Math.min(100, Math.floor(filters.minMatch)))
      : tab === "recommended"
        ? IMPORT_RECOMMENDED_MIN_SCORE
        : 0;

  const searchPattern = toCandidateSearchPattern(filters.search);
  const rolePattern = toIlikePattern(filters.role);
  const locationPattern = toIlikePattern(filters.location);
  const previousTitlePattern = toIlikePattern(filters.previousTitle);
  const statusId = filters.statusId?.trim() || null;
  const skillList = (filters.skills ?? []).map((s) => s.trim()).filter(Boolean);
  const tagList = (filters.tags ?? []).map((s) => s.trim()).filter(Boolean);
  const skillPatterns = nonemptyPatterns(
    skillList.map((s) => toIlikePattern(s)).filter((p): p is string => Boolean(p))
  );
  const tagPatterns = nonemptyPatterns(
    tagList.map((s) => toIlikePattern(s)).filter((p): p is string => Boolean(p))
  );
  const recommendMode = tab === "recommended" && !searchPattern && skillList.length === 0;
  const recPatterns = nonemptyPatterns(recommendMode ? recommendPatterns(job) : []);
  const useRecommendKeywords = recommendMode && recPatterns[0] !== "%__none__%";
  const useSkillSql = skillList.length > 0;
  const useTagSql = tagList.length > 0;
  const fetchLimit = IMPORT_MATCH_FETCH_CAP;
  const experience = filters.experience || "";

  const dbCountRows = (await sql`
    SELECT COUNT(*)::int AS total
    FROM candidates
    WHERE tenant_id = ${tenantId}
  `) as Array<{ total: number }>;
  const databaseTotal = Number(dbCountRows[0]?.total ?? 0);

  const countRows = (await sql`
    SELECT COUNT(*)::int AS total
    FROM candidates c
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    WHERE c.tenant_id = ${tenantId}
      AND (${statusId}::uuid IS NULL OR c.current_status_id = ${statusId}::uuid)
      AND (
        ${locationPattern}::text IS NULL
        OR COALESCE(c.location, '') ILIKE ${locationPattern}
      )
      AND (
        ${rolePattern}::text IS NULL
        OR COALESCE(c.specialty, '') ILIKE ${rolePattern}
        OR EXISTS (
          SELECT 1
          FROM job_match_candidates jmc_r
          JOIN job_match_workspaces w_r ON w_r.id = jmc_r.workspace_id
          WHERE jmc_r.candidate_id = c.id
            AND w_r.tenant_id = ${tenantId}
            AND COALESCE(w_r.job_title, '') ILIKE ${rolePattern}
        )
      )
      AND (
        ${previousTitlePattern}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM job_match_candidates jmc_p
          JOIN job_match_workspaces w_p ON w_p.id = jmc_p.workspace_id
          WHERE jmc_p.candidate_id = c.id
            AND w_p.tenant_id = ${tenantId}
            AND COALESCE(w_p.job_title, '') ILIKE ${previousTitlePattern}
        )
      )
      AND (
        ${searchPattern}::text IS NULL
        OR c.full_name ILIKE ${searchPattern}
        OR COALESCE(c.normalized_full_name, '') ILIKE ${searchPattern}
        OR COALESCE(c.specialty, '') ILIKE ${searchPattern}
        OR COALESCE(c.location, '') ILIKE ${searchPattern}
        OR COALESCE(c.extracted_resume_text, '') ILIKE ${searchPattern}
        OR COALESCE(c.recruiter_notes, '') ILIKE ${searchPattern}
        OR COALESCE(c.verified_information::text, '') ILIKE ${searchPattern}
        OR COALESCE(cs.name, '') ILIKE ${searchPattern}
        OR EXISTS (
          SELECT 1
          FROM job_match_candidates jmc_s
          JOIN job_match_workspaces w_s ON w_s.id = jmc_s.workspace_id
          WHERE jmc_s.candidate_id = c.id
            AND w_s.tenant_id = ${tenantId}
            AND (
              COALESCE(w_s.job_title, '') ILIKE ${searchPattern}
              OR COALESCE(w_s.job_ref, '') ILIKE ${searchPattern}
              OR COALESCE(w_s.specialty, '') ILIKE ${searchPattern}
            )
        )
      )
      AND (
        ${useSkillSql} = false
        OR COALESCE(c.specialty, '') ILIKE ANY(${skillPatterns}::text[])
        OR COALESCE(c.extracted_resume_text, '') ILIKE ANY(${skillPatterns}::text[])
      )
      AND (
        ${useTagSql} = false
        OR COALESCE(c.specialty, '') ILIKE ANY(${tagPatterns}::text[])
        OR COALESCE(c.extracted_resume_text, '') ILIKE ANY(${tagPatterns}::text[])
      )
      AND (
        ${useRecommendKeywords} = false
        OR COALESCE(c.specialty, '') ILIKE ANY(${recPatterns}::text[])
        OR COALESCE(c.location, '') ILIKE ANY(${recPatterns}::text[])
        OR COALESCE(c.extracted_resume_text, '') ILIKE ANY(${recPatterns}::text[])
        OR COALESCE(c.full_name, '') ILIKE ANY(${recPatterns}::text[])
      )
  `) as Array<{ total: number }>;
  const sqlTotal = Number(countRows[0]?.total ?? 0);

  const rows = (await sql`
    SELECT
      c.id,
      c.full_name,
      c.specialty,
      c.location,
      LEFT(COALESCE(c.extracted_resume_text, ''), 12000) AS resume_excerpt,
      LEFT(COALESCE(c.recruiter_notes, ''), 2000) AS recruiter_notes,
      c.verified_information,
      cs.name AS status_name,
      cs.color AS status_color,
      EXISTS (
        SELECT 1
        FROM job_match_candidates jmc
        WHERE jmc.workspace_id = ${workspaceId}
          AND jmc.candidate_id = c.id
      ) AS already_added,
      (
        SELECT w.job_title
        FROM job_match_candidates jmc
        JOIN job_match_workspaces w ON w.id = jmc.workspace_id
        WHERE jmc.candidate_id = c.id
          AND w.tenant_id = ${tenantId}
        ORDER BY jmc.updated_at DESC
        LIMIT 1
      ) AS current_role,
      (
        SELECT COALESCE(array_agg(w.job_title) FILTER (WHERE w.job_title IS NOT NULL), '{}')
        FROM (
          SELECT w2.job_title
          FROM job_match_candidates jmc2
          JOIN job_match_workspaces w2 ON w2.id = jmc2.workspace_id
          WHERE jmc2.candidate_id = c.id
            AND w2.tenant_id = ${tenantId}
          ORDER BY jmc2.updated_at DESC
          LIMIT 6
        ) w
      ) AS previous_titles
    FROM candidates c
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    WHERE c.tenant_id = ${tenantId}
      AND (${statusId}::uuid IS NULL OR c.current_status_id = ${statusId}::uuid)
      AND (
        ${locationPattern}::text IS NULL
        OR COALESCE(c.location, '') ILIKE ${locationPattern}
      )
      AND (
        ${rolePattern}::text IS NULL
        OR COALESCE(c.specialty, '') ILIKE ${rolePattern}
        OR EXISTS (
          SELECT 1
          FROM job_match_candidates jmc_r
          JOIN job_match_workspaces w_r ON w_r.id = jmc_r.workspace_id
          WHERE jmc_r.candidate_id = c.id
            AND w_r.tenant_id = ${tenantId}
            AND COALESCE(w_r.job_title, '') ILIKE ${rolePattern}
        )
      )
      AND (
        ${previousTitlePattern}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM job_match_candidates jmc_p
          JOIN job_match_workspaces w_p ON w_p.id = jmc_p.workspace_id
          WHERE jmc_p.candidate_id = c.id
            AND w_p.tenant_id = ${tenantId}
            AND COALESCE(w_p.job_title, '') ILIKE ${previousTitlePattern}
        )
      )
      AND (
        ${searchPattern}::text IS NULL
        OR c.full_name ILIKE ${searchPattern}
        OR COALESCE(c.normalized_full_name, '') ILIKE ${searchPattern}
        OR COALESCE(c.specialty, '') ILIKE ${searchPattern}
        OR COALESCE(c.location, '') ILIKE ${searchPattern}
        OR COALESCE(c.extracted_resume_text, '') ILIKE ${searchPattern}
        OR COALESCE(c.recruiter_notes, '') ILIKE ${searchPattern}
        OR COALESCE(c.verified_information::text, '') ILIKE ${searchPattern}
        OR COALESCE(cs.name, '') ILIKE ${searchPattern}
        OR EXISTS (
          SELECT 1
          FROM job_match_candidates jmc_s
          JOIN job_match_workspaces w_s ON w_s.id = jmc_s.workspace_id
          WHERE jmc_s.candidate_id = c.id
            AND w_s.tenant_id = ${tenantId}
            AND (
              COALESCE(w_s.job_title, '') ILIKE ${searchPattern}
              OR COALESCE(w_s.job_ref, '') ILIKE ${searchPattern}
              OR COALESCE(w_s.specialty, '') ILIKE ${searchPattern}
            )
        )
      )
      AND (
        ${useSkillSql} = false
        OR COALESCE(c.specialty, '') ILIKE ANY(${skillPatterns}::text[])
        OR COALESCE(c.extracted_resume_text, '') ILIKE ANY(${skillPatterns}::text[])
      )
      AND (
        ${useTagSql} = false
        OR COALESCE(c.specialty, '') ILIKE ANY(${tagPatterns}::text[])
        OR COALESCE(c.extracted_resume_text, '') ILIKE ANY(${tagPatterns}::text[])
      )
      AND (
        ${useRecommendKeywords} = false
        OR COALESCE(c.specialty, '') ILIKE ANY(${recPatterns}::text[])
        OR COALESCE(c.location, '') ILIKE ANY(${recPatterns}::text[])
        OR COALESCE(c.extracted_resume_text, '') ILIKE ANY(${recPatterns}::text[])
        OR COALESCE(c.full_name, '') ILIKE ANY(${recPatterns}::text[])
      )
    ORDER BY
      CASE
        WHEN ${job.specialty || null}::text IS NOT NULL
         AND COALESCE(c.specialty, '') ILIKE ${toIlikePattern(job.specialty)}
        THEN 0 ELSE 1
      END,
      c.updated_at DESC
    LIMIT ${fetchLimit}
  `) as ImportSqlRow[];

  const scored: ImportCandidateView[] = [];
  for (const row of rows) {
    const previousTitles = asStringArray(row.previous_titles);
    const verified =
      row.verified_information && typeof row.verified_information === "object"
        ? row.verified_information
        : null;
    const match = scoreCandidateAgainstJob(job, {
      fullName: row.full_name,
      specialty: row.specialty,
      location: row.location,
      currentRole: row.current_role || row.specialty,
      previousTitles,
      resumeText: row.resume_excerpt,
      notes: row.recruiter_notes,
      verified,
    });

    if (skillList.length > 0) {
      const blob = `${row.specialty ?? ""} ${row.resume_excerpt ?? ""} ${row.current_role ?? ""}`.toLowerCase();
      if (!skillList.every((skill) => phrasePresent(blob, skill))) continue;
    }
    if (tagList.length > 0) {
      const blob = `${match.tags.join(" ")} ${row.specialty ?? ""} ${row.resume_excerpt ?? ""}`.toLowerCase();
      if (!tagList.every((tag) => phrasePresent(blob, tag))) continue;
    }
    if (experience) {
      const bucket = experienceBucket(match.yearsExperience);
      if (bucket !== experience) continue;
    }
    if (match.score < minMatch) continue;

    scored.push({
      id: row.id,
      fullName: row.full_name?.trim() || "Unnamed candidate",
      currentRole: row.current_role || row.specialty,
      location: row.location,
      yearsExperience: match.yearsExperience,
      topSkills: match.matchedSkills,
      tags: match.tags,
      matchScore: match.score,
      matchReasons: match.reasons,
      statusName: row.status_name,
      statusColor: row.status_color,
      alreadyAdded: Boolean(row.already_added),
      experienceHighlights: extractExperienceHighlights(row.resume_excerpt),
    });
  }

  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.fullName.localeCompare(b.fullName);
  });

  const total = scored.length;
  const start = (page - 1) * pageSize;
  const pageRows = scored.slice(start, start + pageSize);

  const [statuses, locationRowsRaw, roleRowsRaw] = await Promise.all([
    listCandidateStatuses(user),
    sql`
      SELECT DISTINCT c.location
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
        AND c.location IS NOT NULL
        AND length(trim(c.location)) > 1
      ORDER BY 1
      LIMIT 40
    `,
    sql`
      SELECT DISTINCT c.specialty
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
        AND c.specialty IS NOT NULL
        AND length(trim(c.specialty)) > 1
      ORDER BY 1
      LIMIT 40
    `,
  ]);
  const locationRows = locationRowsRaw as Array<{ location: string }>;
  const roleRows = roleRowsRaw as Array<{ specialty: string }>;

  const suggestedRoles = uniqueNonEmpty([
    job.title,
    job.specialty,
    ...roleRows.map((r) => r.specialty),
  ]).slice(0, 20);

  return {
    candidates: pageRows,
    total,
    allTotal: databaseTotal,
    recommendedTotal:
      tab === "recommended"
        ? total
        : scored.filter((c) => c.matchScore >= IMPORT_RECOMMENDED_MIN_SCORE).length,
    page,
    pageSize,
    truncated: sqlTotal > fetchLimit,
    job: {
      id: ws.id,
      title: ws.job_title || "Untitled job",
      jobRef: ws.job_ref,
    },
    suggestedTags: job.tags,
    suggestedSkills: [...job.requiredSkills, ...job.preferredSkills].slice(0, 16),
    suggestedRoles,
    facets: {
      locations: locationRows.map((r) => r.location).filter(Boolean),
      roles: roleRows.map((r) => r.specialty).filter(Boolean),
      statuses: statuses.map((s) => ({ id: s.id, name: s.name })),
    },
  };
}

export interface ImportCandidatesResult {
  imported: string[];
  skippedAlreadyAdded: string[];
  skippedNotFound: string[];
}

export async function importExistingCandidatesToWorkspace(
  user: AppUser,
  workspaceId: string,
  candidateIds: string[]
): Promise<ImportCandidatesResult> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const ws = await getWorkspace(user, workspaceId);
  if (!ws) throw new AuthError("Workspace not found.", 404);

  const uniqueIds = [
    ...new Set(
      candidateIds.map((id) => id.trim()).filter((id) => isImportCandidateUuid(id))
    ),
  ].slice(0, IMPORT_MAX_IDS_PER_REQUEST);

  if (uniqueIds.length === 0) {
    return { imported: [], skippedAlreadyAdded: [], skippedNotFound: [] };
  }

  const existingRows = (await sql`
    SELECT jmc.candidate_id
    FROM job_match_candidates jmc
    JOIN job_match_workspaces w ON w.id = jmc.workspace_id
    WHERE jmc.workspace_id = ${workspaceId}
      AND w.tenant_id = ${tenantId}
      AND jmc.candidate_id = ANY(${uniqueIds}::uuid[])
  `) as Array<{ candidate_id: string }>;
  const already = new Set(existingRows.map((r) => r.candidate_id));

  const foundRows = (await sql`
    SELECT
      c.id,
      (c.extracted_resume_text IS NOT NULL AND length(trim(c.extracted_resume_text)) > 40) AS has_resume
    FROM candidates c
    WHERE c.tenant_id = ${tenantId}
      AND c.id = ANY(${uniqueIds}::uuid[])
  `) as Array<{ id: string; has_resume: boolean }>;
  const found = new Map(foundRows.map((r) => [r.id, r.has_resume]));

  const skippedAlreadyAdded = uniqueIds.filter((id) => already.has(id));
  const skippedNotFound = uniqueIds.filter((id) => !found.has(id) && !already.has(id));
  const toInsert = uniqueIds.filter((id) => found.has(id) && !already.has(id));

  const imported: string[] = [];
  for (const candidateId of toInsert) {
    const status: CandidatePipelineStatus = found.get(candidateId)
      ? "READY"
      : "NEEDS_REVIEW";
    const inserted = (await sql`
      INSERT INTO job_match_candidates (workspace_id, candidate_id, owner_user_id, status)
      SELECT ${workspaceId}, c.id, ${user.id}, ${status}
      FROM candidates c
      WHERE c.id = ${candidateId}
        AND c.tenant_id = ${tenantId}
        AND EXISTS (
          SELECT 1 FROM job_match_workspaces w
          WHERE w.id = ${workspaceId} AND w.tenant_id = ${tenantId}
        )
      ON CONFLICT (workspace_id, candidate_id) DO NOTHING
      RETURNING candidate_id
    `) as Array<{ candidate_id: string }>;

    if (inserted.length === 0) {
      skippedAlreadyAdded.push(candidateId);
      continue;
    }

    imported.push(candidateId);
    await logCandidateActivity({
      tenantId,
      candidateId,
      jobId: workspaceId,
      performedByUserId: user.id,
      actionType: "CANDIDATE_IMPORTED",
      newValue: workspaceId,
      metadata: { source: "import_existing", workspace_id: workspaceId },
      actorRole: user.role,
      requestId: `job-import:${workspaceId}:${candidateId}`,
    });
    await logCandidateActivity({
      tenantId,
      candidateId,
      jobId: workspaceId,
      performedByUserId: user.id,
      actionType: "CANDIDATE_ADDED_TO_JOB",
      newValue: workspaceId,
      actorRole: user.role,
      requestId: `job-link:${workspaceId}:${candidateId}:import`,
    });
  }

  if (imported.length > 0) {
    await audit({
      actorUserId: user.id,
      tenantId,
      entityType: "job_match_workspace",
      entityId: workspaceId,
      action: "CANDIDATES_IMPORTED_TO_JOB",
      newValue: {
        imported_count: imported.length,
        skipped_count: skippedAlreadyAdded.length,
      },
    });
  }

  return {
    imported,
    skippedAlreadyAdded: [...new Set(skippedAlreadyAdded)],
    skippedNotFound,
  };
}

export function parseImportSearchParams(url: URL): ImportSearchFilters {
  const minRaw = url.searchParams.get("minMatch");
  const minMatch = minRaw != null && minRaw !== "" ? Number(minRaw) : undefined;
  return {
    tab: url.searchParams.get("tab") === "all" ? "all" : "recommended",
    search: url.searchParams.get("q") ?? url.searchParams.get("search") ?? "",
    page: Number(url.searchParams.get("page") || "1") || 1,
    pageSize: Number(url.searchParams.get("pageSize") || String(IMPORT_PAGE_SIZE_DEFAULT)) || IMPORT_PAGE_SIZE_DEFAULT,
    minMatch: Number.isFinite(minMatch) ? minMatch : undefined,
    role: url.searchParams.get("role") ?? "",
    skills: parseCommaList(url.searchParams.get("skills")),
    tags: parseCommaList(url.searchParams.get("tags")),
    location: url.searchParams.get("location") ?? "",
    experience: parseExperienceParam(url.searchParams.get("experience")),
    statusId: url.searchParams.get("status") ?? "",
    previousTitle: url.searchParams.get("previousTitle") ?? "",
  };
}

function parseExperienceParam(value: string | null): ImportExperienceFilter | "" {
  if (value === "under3" || value === "3to5" || value === "5to10" || value === "10plus") {
    return value;
  }
  return "";
}

function nonemptyPatterns(patterns: string[]): string[] {
  return patterns.length > 0 ? patterns : ["%__none__%"];
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
