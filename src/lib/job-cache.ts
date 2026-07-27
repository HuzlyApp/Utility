import type { StructuredJobFields } from "./types";

export interface NormalizedJobRequirement {
  id: string;
  text: string;
  type: string;
  category: string;
}

export interface NormalizedJobRequirements {
  contentHash: string;
  generatedAt: string;
  version: string;
  mandatoryRequirements: NormalizedJobRequirement[];
  preferredRequirements: NormalizedJobRequirement[];
  requiredLicenses: string[];
  requiredCertifications: string[];
  requiredExperience: Array<{ specialty: string; years: number; isMinimum: boolean }>;
  requiredSpecialties: string[];
  locationConstraints: string[];
  educationRequirements: Array<{ degree: string; isMandatory: boolean }>;
  requiredSkills: string[];
  requiredWorkSettings: string[];
  scheduleRequirements: string[];
  contextualInfo: Record<string, unknown>;
}

interface CacheEntry {
  value: NormalizedJobRequirements;
  accessCount: number;
  createdAt: number;
}

const cache = new Map<string, CacheEntry>();

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function buildKey(tenantId: string, jobDescription: string, structuredFields: unknown): string {
  const hash = djb2Hash(jobDescription + JSON.stringify(structuredFields));
  return `${tenantId}:${hash}`;
}

/**
 * Retrieve cached job requirements if they exist and haven't expired.
 */
export function getCachedJobRequirements(
  tenantId: string,
  jobDescription: string,
  structuredFields: unknown
): NormalizedJobRequirements | null {
  const key = buildKey(tenantId, jobDescription, structuredFields);
  const entry = cache.get(key);
  if (!entry) return null;

  const ttl = getEnvNumber("JOB_CACHE_TTL_MS", 3600000);
  if (Date.now() - entry.createdAt > ttl) {
    cache.delete(key);
    return null;
  }

  entry.accessCount++;
  return entry.value;
}

/**
 * Store normalized job requirements in the cache.
 */
export function setCachedJobRequirements(
  tenantId: string,
  jobDescription: string,
  requirements: NormalizedJobRequirements,
  structuredFields: unknown
): void {
  const maxSize = getEnvNumber("JOB_CACHE_MAX_SIZE", 100);

  if (cache.size >= maxSize) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  const key = buildKey(tenantId, jobDescription, structuredFields);
  cache.set(key, { value: requirements, accessCount: 1, createdAt: Date.now() });
}

/**
 * Clear the job-requirements cache. If a tenantId is provided, only entries
 * for that tenant are removed.
 */
export function invalidateJobCache(tenantId?: string): void {
  if (!tenantId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      cache.delete(key);
    }
  }
}

/**
 * Get cache statistics for observability.
 */
function getEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return defaultValue;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function getCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
  entries: Array<{ tenantId: string; accessCount: number }>;
} {
  return getJobCacheStats();
}

export function getJobCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
  entries: Array<{ tenantId: string; accessCount: number }>;
} {
  const maxSize = getEnvNumber("JOB_CACHE_MAX_SIZE", 100);
  const ttlMs = getEnvNumber("JOB_CACHE_TTL_MS", 3600000);
  const entries: Array<{ tenantId: string; accessCount: number }> = [];
  for (const [key, value] of cache) {
    const tenantId = key.split(":")[0];
    entries.push({ tenantId, accessCount: value.accessCount });
  }
  return { size: cache.size, maxSize, ttlMs, entries };
}

function extractLicenses(text: string): string[] {
  const results: string[] = [];
  const licensePatterns = [
    /\b([A-Z]{2,}(?:\([A-Z]+\))?)\s+license\b/gi,
    /license[d]?\s*:?\s*([A-Z]{2,}(?:\([A-Z]+\))?)/gi,
    /\b(RN|LPN|NP|PA|MD|DO|ARRT|RT|CLS|MT|MLS|CNA|CMA|EMT|Paramedic)\b/g,
  ];
  for (const pattern of licensePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[1] || match[0];
      if (candidate) results.push(candidate.trim().toUpperCase());
    }
  }
  return [...new Set(results)];
}

function extractCertifications(text: string): string[] {
  const results: string[] = [];
  const certPatterns = [
    /\b(BLS|ACLS|PALS|CPR|NRP|TNCC|CNOR|CCRN|CEN|ARRT\(CT\)|ARRT\(MR\)|ARRT|CNA|CMA)\b/gi,
    /certification[s]?\s*:?\s*([A-Z]{2,}(?:\([A-Z]+\))?)/gi,
  ];
  for (const pattern of certPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[1] || match[0];
      if (candidate) results.push(candidate.trim().toUpperCase());
    }
  }
  return [...new Set(results)];
}

function extractSpecialties(text: string, structuredSpecialty?: string): string[] {
  const results: string[] = [];
  if (structuredSpecialty) results.push(structuredSpecialty);
  const specialtyPatterns = [
    /\b(ICU|ER|ED|OR|PACU|CVICU|NICU|PICU|MICU|SICU|CT|MRI|X-Ray|Rad|Ultrasound|Labor and Delivery|L&D|Maternal|Pediatric|Ortho|Neuro|Cardiac|Oncology|Dialysis|Home Health|Hospice|SNF|LTAC)\b/gi,
  ];
  for (const pattern of specialtyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0]) results.push(match[0].trim());
    }
  }
  return [...new Set(results)];
}

/**
 * Extract basic requirements from job description text and structured fields.
 */
export function extractBasicRequirements(
  text: string,
  structuredFields?: { specialty?: string }
): Partial<NormalizedJobRequirements> {
  const requiredLicenses = extractLicenses(text);
  const requiredCertifications = extractCertifications(text);
  const requiredSpecialties = extractSpecialties(text, structuredFields?.specialty);

  return {
    requiredLicenses,
    requiredCertifications,
    requiredSpecialties,
    requiredExperience: [],
    locationConstraints: [],
    educationRequirements: [],
    requiredSkills: [],
    requiredWorkSettings: [],
    scheduleRequirements: [],
    contextualInfo: {},
  };
}

/**
 * Normalize a job description into reusable requirements.
 * Results are cached by content hash so the same job is not re-parsed
 * for every candidate analyzed against it.
 */
export function normalizeJobRequirements(
  jobDescriptionText: string,
  structuredJobFields?: StructuredJobFields,
  tenantId?: string
): NormalizedJobRequirements {
  const effectiveTenant = tenantId ?? "default";
  const cached = getCachedJobRequirements(
    effectiveTenant,
    jobDescriptionText,
    structuredJobFields ?? {}
  );
  if (cached) {
    return cached;
  }

  const structured = structuredJobFields ?? {};
  const hash = djb2Hash(jobDescriptionText + JSON.stringify(structured));
  const now = new Date().toISOString();

  const mandatory: NormalizedJobRequirement[] = [];
  const preferred: NormalizedJobRequirement[] = [];
  let reqId = 1;

  function addReq(
    text: string,
    type: "mandatory" | "preferred",
    category: string
  ) {
    const list = type === "mandatory" ? mandatory : preferred;
    list.push({ id: String(reqId++), text, type, category });
  }

  if (structured.mandatory_requirements) {
    structured.mandatory_requirements
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .forEach((r) => addReq(r, "mandatory", "requirement"));
  }
  if (structured.preferred_requirements) {
    structured.preferred_requirements
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .forEach((r) => addReq(r, "preferred", "requirement"));
  }
  if (structured.required_licenses) {
    addReq(structured.required_licenses, "mandatory", "license");
  }
  if (structured.required_certifications) {
    addReq(structured.required_certifications, "mandatory", "certification");
  }
  if (structured.education_requirements) {
    addReq(structured.education_requirements, "preferred", "education");
  }
  if (structured.required_clinical_skills) {
    addReq(structured.required_clinical_skills, "mandatory", "skill");
  }
  if (structured.required_equipment) {
    addReq(structured.required_equipment, "mandatory", "equipment");
  }
  if (structured.required_patient_population) {
    addReq(structured.required_patient_population, "mandatory", "population");
  }
  if (structured.required_work_setting) {
    addReq(structured.required_work_setting, "mandatory", "setting");
  }
  if (structured.required_trauma_level) {
    addReq(structured.required_trauma_level, "mandatory", "trauma");
  }
  if (structured.required_shift) {
    addReq(structured.required_shift, "mandatory", "schedule");
  }
  if (structured.additional_submission_restrictions) {
    addReq(structured.additional_submission_restrictions, "mandatory", "restriction");
  }

  // Parse years of experience if present.
  let requiredExperience: Array<{ specialty: string; years: number; isMinimum: boolean }> = [];
  if (structured.minimum_years_experience) {
    const match = structured.minimum_years_experience.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      requiredExperience = [
        {
          specialty: structured.specialty ?? "",
          years: parseFloat(match[1]),
          isMinimum: true,
        },
      ];
    }
  }

  const basic = extractBasicRequirements(jobDescriptionText, {
    specialty: structured.specialty,
  });

  const result: NormalizedJobRequirements = {
    contentHash: hash,
    generatedAt: now,
    version: "1.0",
    mandatoryRequirements: mandatory,
    preferredRequirements: preferred,
    requiredLicenses: basic.requiredLicenses ?? [],
    requiredCertifications: basic.requiredCertifications ?? [],
    requiredExperience,
    requiredSpecialties: basic.requiredSpecialties ?? [],
    locationConstraints: basic.locationConstraints ?? [],
    educationRequirements: basic.educationRequirements ?? [],
    requiredSkills: basic.requiredSkills ?? [],
    requiredWorkSettings: basic.requiredWorkSettings ?? [],
    scheduleRequirements: basic.scheduleRequirements ?? [],
    contextualInfo: basic.contextualInfo ?? {},
  };

  setCachedJobRequirements(effectiveTenant, jobDescriptionText, result, structured);
  return result;
}

/**
 * Clear the in-memory job-requirements cache. Useful in tests.
 */
export function clearJobCache(): void {
  invalidateJobCache();
}
