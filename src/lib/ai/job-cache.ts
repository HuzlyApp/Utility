import "server-only";
import { createHash } from "crypto";
import { getSql } from "@/lib/dal/client";
import type { StructuredJobFields } from "@/lib/types";

export interface CachedJobRequirements {
  sourceHash: string;
  mandatoryRequirements: string[];
  preferredRequirements: string[];
  requiredLicenses: string[];
  requiredCertifications: string[];
  requiredYearsExperience: string;
  specialtyRequirements: string[];
  locationConstraints: string;
  educationRequirements: string[];
  requirementWeights?: Record<string, number>;
  analysisVersion: string;
  modelUsed: string;
}

function hashJobContent(
  jobText: string,
  structured?: StructuredJobFields
): string {
  const payload = JSON.stringify({ text: jobText, structured });
  return createHash("sha256").update(payload).digest("hex");
}

// In-memory LRU cache for the current serverless invocation.
const memoryCache = new Map<string, CachedJobRequirements>();
const MAX_MEMORY_CACHE = 50;

function getMemory(key: string): CachedJobRequirements | undefined {
  return memoryCache.get(key);
}

function setMemory(key: string, value: CachedJobRequirements): void {
  if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
  memoryCache.set(key, value);
}

async function getDbCache(
  hash: string,
  tenantId?: string
): Promise<CachedJobRequirements | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        source_hash,
        normalized_mandatory_requirements,
        normalized_preferred_requirements,
        required_licenses,
        required_certifications,
        required_years_experience,
        specialty_requirements,
        location_constraints,
        education_requirements,
        requirement_weights,
        analysis_version,
        model_used
      FROM job_analysis_cache
      WHERE source_hash = ${hash}
        AND tenant_id = ${tenantId ?? "default"}
      LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      sourceHash: r.source_hash as string,
      mandatoryRequirements: (r.normalized_mandatory_requirements as string[]) ?? [],
      preferredRequirements: (r.normalized_preferred_requirements as string[]) ?? [],
      requiredLicenses: (r.required_licenses as string[]) ?? [],
      requiredCertifications: (r.required_certifications as string[]) ?? [],
      requiredYearsExperience: (r.required_years_experience as string) ?? "",
      specialtyRequirements: (r.specialty_requirements as string[]) ?? [],
      locationConstraints: (r.location_constraints as string) ?? "",
      educationRequirements: (r.education_requirements as string[]) ?? [],
      requirementWeights: (r.requirement_weights as Record<string, number>) ?? undefined,
      analysisVersion: (r.analysis_version as string) ?? "1.0",
      modelUsed: (r.model_used as string) ?? "",
    };
  } catch {
    return null;
  }
}

async function setDbCache(
  value: CachedJobRequirements,
  tenantId?: string
): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO job_analysis_cache (
        tenant_id, source_hash,
        normalized_mandatory_requirements, normalized_preferred_requirements,
        required_licenses, required_certifications, required_years_experience,
        specialty_requirements, location_constraints, education_requirements,
        requirement_weights, analysis_version, model_used
      ) VALUES (
        ${tenantId ?? "default"}, ${value.sourceHash},
        ${value.mandatoryRequirements}, ${value.preferredRequirements},
        ${value.requiredLicenses}, ${value.requiredCertifications},
        ${value.requiredYearsExperience}, ${value.specialtyRequirements},
        ${value.locationConstraints}, ${value.educationRequirements},
        ${value.requirementWeights ? JSON.stringify(value.requirementWeights) : null},
        ${value.analysisVersion}, ${value.modelUsed}
      )
      ON CONFLICT (source_hash) DO UPDATE SET
        normalized_mandatory_requirements = EXCLUDED.normalized_mandatory_requirements,
        normalized_preferred_requirements = EXCLUDED.normalized_preferred_requirements,
        required_licenses = EXCLUDED.required_licenses,
        required_certifications = EXCLUDED.required_certifications,
        required_years_experience = EXCLUDED.required_years_experience,
        specialty_requirements = EXCLUDED.specialty_requirements,
        location_constraints = EXCLUDED.location_constraints,
        education_requirements = EXCLUDED.education_requirements,
        requirement_weights = EXCLUDED.requirement_weights,
        analysis_version = EXCLUDED.analysis_version,
        model_used = EXCLUDED.model_used,
        updated_at = NOW()
    `;
  } catch {
    /* best-effort cache persistence */
  }
}

/**
 * Build a concise job-requirements string from structured fields.
 * This is used instead of the full job-description text when a cache hit occurs.
 */
export function buildCachedJobRequirements(
  cached: CachedJobRequirements
): string {
  const lines: string[] = [];

  if (cached.mandatoryRequirements.length > 0) {
    lines.push("MANDATORY REQUIREMENTS");
    for (const r of cached.mandatoryRequirements) lines.push(`- ${r}`);
  }
  if (cached.preferredRequirements.length > 0) {
    lines.push("PREFERRED REQUIREMENTS");
    for (const r of cached.preferredRequirements) lines.push(`- ${r}`);
  }
  if (cached.requiredLicenses.length > 0) {
    lines.push(`REQUIRED LICENSES: ${cached.requiredLicenses.join(", ")}`);
  }
  if (cached.requiredCertifications.length > 0) {
    lines.push(
      `REQUIRED CERTIFICATIONS: ${cached.requiredCertifications.join(", ")}`
    );
  }
  if (cached.requiredYearsExperience) {
    lines.push(`REQUIRED EXPERIENCE: ${cached.requiredYearsExperience}`);
  }
  if (cached.specialtyRequirements.length > 0) {
    lines.push(`SPECIALTY: ${cached.specialtyRequirements.join(", ")}`);
  }
  if (cached.locationConstraints) {
    lines.push(`LOCATION: ${cached.locationConstraints}`);
  }
  if (cached.educationRequirements.length > 0) {
    lines.push(`EDUCATION: ${cached.educationRequirements.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Derive normalized requirements from structured job fields.
 * This is a fast, deterministic extraction that does not call Claude.
 */
export function normalizeRequirementsFromFields(
  structured?: StructuredJobFields
): CachedJobRequirements {
  const s = structured ?? {};
  const mandatory: string[] = [];
  const preferred: string[] = [];

  if (s.mandatory_requirements) {
    mandatory.push(
      ...s.mandatory_requirements.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    );
  }
  if (s.preferred_requirements) {
    preferred.push(
      ...s.preferred_requirements.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    );
  }

  return {
    sourceHash: "",
    mandatoryRequirements: mandatory,
    preferredRequirements: preferred,
    requiredLicenses: s.required_licenses ? [s.required_licenses] : [],
    requiredCertifications: s.required_certifications
      ? [s.required_certifications]
      : [],
    requiredYearsExperience: s.minimum_years_experience ?? "",
    specialtyRequirements: s.specialty ? [s.specialty] : [],
    locationConstraints: s.location ?? "",
    educationRequirements: s.education_requirements
      ? [s.education_requirements]
      : [],
    requirementWeights: undefined,
    analysisVersion: "1.0",
    modelUsed: "structured-extraction",
  };
}

export interface GetJobCacheOptions {
  jobText: string;
  structured?: StructuredJobFields;
  tenantId?: string;
  modelUsed?: string;
}

/**
 * Retrieve cached normalized job requirements.
 * Falls back to deterministic extraction from structured fields.
 */
export async function getJobRequirementsCache(
  opts: GetJobCacheOptions
): Promise<{ cached: CachedJobRequirements; hit: boolean }> {
  const hash = hashJobContent(opts.jobText, opts.structured);

  // 1. In-memory
  const mem = getMemory(hash);
  if (mem) return { cached: mem, hit: true };

  // 2. Database
  const db = await getDbCache(hash, opts.tenantId);
  if (db) {
    setMemory(hash, db);
    return { cached: db, hit: true };
  }

  // 3. Build from structured fields (fast, no AI call)
  const built = normalizeRequirementsFromFields(opts.structured);
  built.sourceHash = hash;
  built.modelUsed = opts.modelUsed ?? built.modelUsed;

  setMemory(hash, built);
  await setDbCache(built, opts.tenantId);

  return { cached: built, hit: false };
}
