import type { DashboardCandidateRow } from "@/lib/dal/candidates";

export const CANDIDATE_SORT_KEYS = [
  "name",
  "jobCode",
  "phone",
  "email",
  "matchedJob",
  "match",
  "status",
  "assigned",
  "updated",
] as const;

export type CandidateSortKey = (typeof CANDIDATE_SORT_KEYS)[number];

export const DEFAULT_CANDIDATE_SORT: CandidateSortKey = "updated";
export const DEFAULT_CANDIDATE_SORT_DIR = "desc" as const;

export type CandidateColumnId =
  | "candidate"
  | "jobCode"
  | "phone"
  | "email"
  | "matchedJob"
  | "match"
  | "status"
  | "assigned"
  | "updated";

export interface CandidateColumnDef {
  id: CandidateColumnId;
  label: string;
  /** Locked columns cannot be hidden. */
  required?: boolean;
  /** Contact columns hide entirely when the viewer cannot see contact. */
  contactOnly?: boolean;
  sortable?: boolean;
  sortKey?: CandidateSortKey;
  width: string;
}

export const CANDIDATE_COLUMNS: CandidateColumnDef[] = [
  {
    id: "candidate",
    label: "Candidate",
    required: true,
    sortable: true,
    sortKey: "name",
    width: "190px",
  },
  {
    id: "jobCode",
    label: "Job Code",
    sortable: true,
    sortKey: "jobCode",
    width: "85px",
  },
  {
    id: "phone",
    label: "Phone Number",
    contactOnly: true,
    sortable: true,
    sortKey: "phone",
    width: "135px",
  },
  {
    id: "email",
    label: "Email Address",
    contactOnly: true,
    sortable: true,
    sortKey: "email",
    width: "190px",
  },
  {
    id: "matchedJob",
    label: "Matched job",
    sortable: true,
    sortKey: "matchedJob",
    width: "190px",
  },
  {
    id: "match",
    label: "Match",
    sortable: true,
    sortKey: "match",
    width: "85px",
  },
  {
    id: "status",
    label: "Status",
    sortable: true,
    sortKey: "status",
    width: "190px",
  },
  {
    id: "assigned",
    label: "Assigned",
    sortable: true,
    sortKey: "assigned",
    width: "130px",
  },
  {
    id: "updated",
    label: "Last updated",
    sortable: true,
    sortKey: "updated",
    width: "145px",
  },
];

const SORT_KEY_SET = new Set<string>(CANDIDATE_SORT_KEYS);

export function parseStatusIdsParam(
  raw: string | null | undefined
): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

export function formatStatusIdsParam(ids: string[]): string {
  return ids.join(",");
}

/** `1` = has matched job, `0` = no matched job. */
export function parseHasMatchedJobParam(
  raw: string | null | undefined
): boolean | undefined {
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return undefined;
}

export function parseCandidateSortParam(
  raw: string | null | undefined
): CandidateSortKey {
  if (raw && SORT_KEY_SET.has(raw)) return raw as CandidateSortKey;
  return DEFAULT_CANDIDATE_SORT;
}

export function parseSortDirParam(
  raw: string | null | undefined
): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function cmpNullableString(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: "asc" | "desc"
): number {
  const as = (a ?? "").trim().toLowerCase();
  const bs = (b ?? "").trim().toLowerCase();
  const aEmpty = !as;
  const bEmpty = !bs;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (as < bs) return dir === "asc" ? -1 : 1;
  if (as > bs) return dir === "asc" ? 1 : -1;
  return 0;
}

function cmpNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: "asc" | "desc"
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function sortValue(
  row: DashboardCandidateRow,
  key: CandidateSortKey
): string | number | null {
  switch (key) {
    case "name":
      return row.full_name;
    case "jobCode":
      return row.job_code;
    case "phone":
      return row.phone;
    case "email":
      return row.email;
    case "matchedJob":
      return row.job_title;
    case "match":
      return row.match_score;
    case "status":
      return row.status_name;
    case "assigned":
      return row.assigned_recruiter_name || "Unassigned";
    case "updated":
      return row.updated_at;
    default:
      return null;
  }
}

export function sortDashboardCandidates(
  rows: DashboardCandidateRow[],
  sortKey: CandidateSortKey,
  sortDir: "asc" | "desc"
): DashboardCandidateRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortKey === "match") {
      return cmpNullableNumber(a.match_score, b.match_score, sortDir);
    }
    if (sortKey === "updated") {
      const at = a.updated_at ? Date.parse(a.updated_at) : NaN;
      const bt = b.updated_at ? Date.parse(b.updated_at) : NaN;
      const aOk = Number.isFinite(at);
      const bOk = Number.isFinite(bt);
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return sortDir === "asc" ? at - bt : bt - at;
    }
    return cmpNullableString(
      sortValue(a, sortKey) as string | null,
      sortValue(b, sortKey) as string | null,
      sortDir
    );
  });
  return copy;
}

export const COLUMN_VISIBILITY_STORAGE_KEY = "utility.candidate_list.columns";

export function defaultVisibleColumns(canViewContact: boolean): CandidateColumnId[] {
  return CANDIDATE_COLUMNS.filter(
    (c) => !c.contactOnly || canViewContact
  ).map((c) => c.id);
}

export function parseVisibleColumns(
  raw: string | null,
  canViewContact: boolean
): CandidateColumnId[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set(
      CANDIDATE_COLUMNS.filter((c) => !c.contactOnly || canViewContact).map(
        (c) => c.id
      )
    );
    const ids = parsed.filter(
      (id): id is CandidateColumnId =>
        typeof id === "string" && allowed.has(id as CandidateColumnId)
    );
    // Always keep required columns.
    for (const col of CANDIDATE_COLUMNS) {
      if (col.required && allowed.has(col.id) && !ids.includes(col.id)) {
        ids.unshift(col.id);
      }
    }
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}
