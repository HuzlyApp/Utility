/**
 * Lexical candidate-to-job matching for Import Candidates.
 * Modular so scoring weights can be improved later without changing the API.
 * This is not a substitute for full AI analysis after import.
 */

import type { StructuredJobFields } from "@/lib/types";

export const IMPORT_MATCH_FETCH_CAP = 250;
export const IMPORT_PAGE_SIZE_DEFAULT = 25;
export const IMPORT_PAGE_SIZE_MAX = 50;
export const IMPORT_MAX_IDS_PER_REQUEST = 50;
export const IMPORT_RECOMMENDED_MIN_SCORE = 60;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "of",
  "to",
  "in",
  "for",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "is",
  "are",
  "was",
  "be",
  "this",
  "that",
  "will",
  "you",
  "your",
  "our",
  "we",
  "they",
  "their",
  "job",
  "role",
  "work",
  "working",
  "required",
  "preferred",
  "must",
  "have",
  "has",
  "including",
  "ability",
  "experience",
  "years",
  "year",
  "plus",
]);

/** Industry / practice tags inferred from job and résumé text. */
export const DISCOVERY_TAGS = [
  "Product Management",
  "SaaS",
  "B2B",
  "B2C",
  "Agile",
  "Healthcare",
  "FinTech",
  "Leadership",
  "Remote",
  "Senior",
  "Technical",
  "Nursing",
  "Travel",
  "ICU",
  "Med-Surg",
  "Telemetry",
  "Emergency",
  "OR",
  "Analytics",
  "Roadmap",
  "Stakeholder",
] as const;

export interface JobMatchProfile {
  title: string;
  description: string;
  specialty: string;
  department: string;
  location: string;
  requiredSkills: string[];
  preferredSkills: string[];
  tags: string[];
  certifications: string[];
  education: string[];
  minYears: number | null;
  keywords: string[];
}

export interface CandidateMatchInput {
  fullName?: string | null;
  specialty?: string | null;
  location?: string | null;
  currentRole?: string | null;
  previousTitles?: string[] | null;
  resumeText?: string | null;
  notes?: string | null;
  verified?: Record<string, unknown> | null;
}

export interface CandidateImportMatch {
  score: number;
  band: "excellent" | "strong" | "good" | "possible" | "low";
  reasons: string[];
  matchedSkills: string[];
  tags: string[];
  yearsExperience: number | null;
}

export interface ImportCandidateView {
  id: string;
  fullName: string;
  currentRole: string | null;
  location: string | null;
  yearsExperience: number | null;
  topSkills: string[];
  tags: string[];
  matchScore: number;
  matchReasons: string[];
  statusName: string | null;
  statusColor: string | null;
  alreadyAdded: boolean;
  experienceHighlights: string[];
}

export function splitRequirementList(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  const parts = value
    .split(/[\n;,•|]+|(?:\s+[-–—]\s+)/)
    .map((part) => part.replace(/^[\s*-]+/, "").trim())
    .filter((part) => part.length >= 2 && part.length <= 120);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9+.#/-]{1,}/g) ?? []) {
    const token = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    if (token.length < 3 || STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function haystackOf(candidate: CandidateMatchInput): string {
  const verified = candidate.verified
    ? Object.values(candidate.verified)
        .filter((v) => typeof v === "string")
        .join(" ")
    : "";
  return [
    candidate.fullName,
    candidate.specialty,
    candidate.location,
    candidate.currentRole,
    ...(candidate.previousTitles ?? []),
    candidate.resumeText,
    candidate.notes,
    verified,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function phrasePresent(haystack: string, phrase: string): boolean {
  const p = phrase.toLowerCase().trim();
  if (p.length < 2) return false;
  if (p.length >= 4 && haystack.includes(p)) return true;
  const tokens = tokenize(p);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

export function extractYearsExperience(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = [
    ...text.matchAll(
      /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi
    ),
  ];
  if (matches.length === 0) return null;
  const years = Math.max(...matches.map((m) => Number(m[1])));
  if (!Number.isFinite(years) || years <= 0) return null;
  return Math.min(50, years);
}

export function parseMinimumYears(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const match = value.match(/(\d{1,2})/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function extractExperienceHighlights(
  resume: string | null | undefined,
  limit = 5
): string[] {
  if (!resume?.trim()) return [];
  const lines = resume
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 16 && line.length <= 180);
  const dated = lines.filter((line) =>
    /\b(20\d{2}|19\d{2}|present|current|\d+\+?\s*(?:years?|yrs?))\b/i.test(line)
  );
  const source = dated.length > 0 ? dated : lines;
  return source.slice(0, limit);
}

export function detectTags(text: string): string[] {
  const hay = text.toLowerCase();
  return DISCOVERY_TAGS.filter((tag) => {
    const needle = tag.toLowerCase();
    if (needle === "or") return /\b(?:\bor\b|operating room)\b/.test(hay);
    return hay.includes(needle);
  });
}

export function matchBand(
  score: number
): CandidateImportMatch["band"] {
  if (score >= 90) return "excellent";
  if (score >= 80) return "strong";
  if (score >= 70) return "good";
  if (score >= 60) return "possible";
  return "low";
}

export function jobProfileFromWorkspace(ws: {
  job_title?: string | null;
  job_description_text?: string | null;
  specialty?: string | null;
  department?: string | null;
  location?: string | null;
  structured_requirements?: StructuredJobFields | null;
}): JobMatchProfile {
  const sr = ws.structured_requirements ?? {};
  const requiredSkills = uniqueStrings([
    ...splitRequirementList(sr.mandatory_requirements),
    ...splitRequirementList(sr.required_clinical_skills),
    ...splitRequirementList(sr.required_equipment),
    ...splitRequirementList(sr.required_charting_system),
    ...splitRequirementList(sr.required_work_setting),
    ...splitRequirementList(sr.required_patient_population),
  ]);
  const preferredSkills = uniqueStrings([
    ...splitRequirementList(sr.preferred_requirements),
    ...splitRequirementList(sr.required_shift),
  ]);
  const certifications = uniqueStrings([
    ...splitRequirementList(sr.required_certifications),
    ...splitRequirementList(sr.required_licenses),
  ]);
  const education = uniqueStrings([
    ...splitRequirementList(sr.education_requirements),
    ...splitRequirementList(sr.program_accreditation_requirements),
  ]);
  const title = (ws.job_title ?? sr.job_title ?? "").trim();
  const specialty = (ws.specialty ?? sr.specialty ?? "").trim();
  const department = (ws.department ?? sr.department ?? "").trim();
  const location = (ws.location ?? sr.location ?? "").trim();
  const description = (ws.job_description_text ?? "").trim();
  const blob = [
    title,
    description,
    specialty,
    department,
    location,
    requiredSkills.join(" "),
    preferredSkills.join(" "),
    certifications.join(" "),
    education.join(" "),
  ].join("\n");
  const tags = uniqueStrings([
    specialty,
    department,
    ...detectTags(blob),
  ]);
  const keywords = tokenize(blob).slice(0, 24);
  return {
    title,
    description,
    specialty,
    department,
    location,
    requiredSkills,
    preferredSkills,
    tags,
    certifications,
    education,
    minYears: parseMinimumYears(sr.minimum_years_experience),
    keywords,
  };
}

export function scoreCandidateAgainstJob(
  job: JobMatchProfile,
  candidate: CandidateMatchInput
): CandidateImportMatch {
  const hay = haystackOf(candidate);
  const yearsExperience =
    extractYearsExperience(hay) ??
    extractYearsExperience(
      typeof candidate.verified?.license_information === "string"
        ? candidate.verified.license_information
        : null
    );
  const reasons: string[] = [];
  let weighted = 0;
  let max = 0;

  const roleText = [candidate.currentRole, candidate.specialty, ...(candidate.previousTitles ?? [])]
    .filter(Boolean)
    .join(" ");
  max += 22;
  const titleScore = titleSimilarity(job.title, roleText, hay);
  weighted += 22 * titleScore;
  if (titleScore >= 0.7 && job.title) {
    reasons.push(`Role aligns with ${job.title}`);
  } else if (candidate.currentRole && titleScore >= 0.4) {
    reasons.push(`Related experience as ${candidate.currentRole}`);
  }

  const required = job.requiredSkills.slice(0, 12);
  if (required.length > 0) {
    max += 28;
    const matched = required.filter((skill) => phrasePresent(hay, skill));
    const ratio = matched.length / required.length;
    weighted += 28 * ratio;
    if (matched.length > 0) {
      reasons.push(`${matched.length}/${required.length} required skills matched`);
    }
  } else {
    const keywordHits = job.keywords.filter((kw) => hay.includes(kw)).length;
    const denom = Math.max(6, Math.min(job.keywords.length, 12));
    max += 28;
    const ratio = denom === 0 ? 0 : Math.min(1, keywordHits / denom);
    weighted += 28 * ratio;
    if (keywordHits >= 3) {
      reasons.push(`${keywordHits} job keywords found in profile`);
    }
  }

  const preferred = job.preferredSkills.slice(0, 8);
  max += 10;
  if (preferred.length > 0) {
    const matchedPref = preferred.filter((skill) => phrasePresent(hay, skill));
    weighted += 10 * (matchedPref.length / preferred.length);
    if (matchedPref.length > 0) {
      reasons.push(`${matchedPref.length} preferred qualifications matched`);
    }
  } else {
    weighted += 5;
  }

  max += 10;
  if (job.minYears != null && yearsExperience != null) {
    if (yearsExperience >= job.minYears) {
      weighted += 10;
      reasons.push(`${yearsExperience} years experience (meets ${job.minYears}+ requirement)`);
    } else if (yearsExperience >= Math.max(0, job.minYears - 2)) {
      weighted += 6;
      reasons.push(`${yearsExperience} years experience (near ${job.minYears}+ requirement)`);
    } else {
      weighted += 2;
    }
  } else if (yearsExperience != null) {
    weighted += yearsExperience >= 8 ? 8 : yearsExperience >= 3 ? 6 : 4;
    const roleLabel = job.specialty || job.title;
    if (roleLabel && yearsExperience >= 5) {
      reasons.push(`${yearsExperience} years toward ${roleLabel}`);
    } else {
      reasons.push(`${yearsExperience} years of relevant experience`);
    }
  } else {
    weighted += 5;
  }

  max += 10;
  if (job.specialty) {
    if (phrasePresent(hay, job.specialty)) {
      weighted += 10;
      reasons.push(`${job.specialty} background`);
    } else {
      const overlap = tokenOverlap(tokenize(job.specialty), tokenize(hay));
      weighted += 10 * overlap;
    }
  } else {
    weighted += 6;
  }

  max += 8;
  if (job.location) {
    if (phrasePresent(hay, job.location) || tokenOverlap(tokenize(job.location), tokenize(candidate.location ?? hay)) >= 0.5) {
      weighted += 8;
      reasons.push(`Location fit: ${job.location}`);
    } else if (/\bremote\b/i.test(hay)) {
      weighted += 4;
      reasons.push("Remote or flexible location");
    }
  } else {
    weighted += 5;
  }

  max += 6;
  const creds = [...job.certifications, ...job.education];
  if (creds.length > 0) {
    const matchedCreds = creds.filter((item) => phrasePresent(hay, item));
    weighted += 6 * (matchedCreds.length / creds.length);
    if (matchedCreds.length > 0) {
      reasons.push(`${matchedCreds.length} certification/education items matched`);
    }
  } else {
    weighted += 3;
  }

  max += 6;
  const jdTokens = job.keywords.slice(0, 16);
  if (jdTokens.length > 0) {
    const hits = jdTokens.filter((kw) => hay.includes(kw)).length;
    weighted += 6 * Math.min(1, hits / Math.min(jdTokens.length, 10));
  } else {
    weighted += 3;
  }

  const score = max > 0 ? Math.round((weighted / max) * 100) : 0;
  const matchedSkills = uniqueStrings(
    [...required, ...preferred].filter((skill) => phrasePresent(hay, skill))
  ).slice(0, 8);
  const tags = uniqueStrings([
    ...(candidate.specialty ? [candidate.specialty] : []),
    ...detectTags(hay),
    ...job.tags.filter((tag) => phrasePresent(hay, tag)),
  ]).slice(0, 8);

  const uniqueReasons = uniqueStrings(reasons).slice(0, 6);
  if (uniqueReasons.length === 0 && score >= 50) {
    uniqueReasons.push("Partial overlap with job title and description");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    band: matchBand(score),
    reasons: uniqueReasons,
    matchedSkills,
    tags,
    yearsExperience,
  };
}

export function experienceBucket(years: number | null): "under3" | "3to5" | "5to10" | "10plus" | null {
  if (years == null) return null;
  if (years < 3) return "under3";
  if (years < 5) return "3to5";
  if (years < 10) return "5to10";
  return "10plus";
}

export function parseCommaList(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return uniqueStrings(value.split(",").map((part) => part.trim()).filter(Boolean));
}

function titleSimilarity(jobTitle: string, roleText: string, haystack: string): number {
  if (!jobTitle.trim()) return 0.5;
  if (phrasePresent(haystack, jobTitle) || phrasePresent(roleText.toLowerCase(), jobTitle)) {
    return 1;
  }
  const jobTokens = tokenize(jobTitle);
  if (jobTokens.length === 0) return 0.5;
  const roleTokens = tokenize(`${roleText} ${haystack.slice(0, 400)}`);
  return tokenOverlap(jobTokens, roleTokens);
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / a.length;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function isImportCandidateUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}
