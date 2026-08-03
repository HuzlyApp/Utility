import "server-only";
import { getSql } from "./client";
import { AuthError, type AppUser } from "@/lib/auth/session";
import {
  averageFollowUpHours,
  computeProductivityScore,
  MEANINGFUL_CANDIDATE_ACTIONS,
  type RecruiterMetricCounts,
} from "@/lib/recruiter-activity";
import type { TenantUserRow } from "./users";
import { listTenantUsers } from "./users";

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

function assertTenantAccess(user: AppUser, tenantId: string): void {
  if (user.role === "SUPER_ADMIN") return;
  if (!user.tenantId || user.tenantId !== tenantId) {
    throw new AuthError("Tenant access denied.", 403);
  }
}

const MEANINGFUL = [...MEANINGFUL_CANDIDATE_ACTIONS];

export interface PeriodBounds {
  from: Date;
  to: Date;
}

export interface KpiSnapshot {
  activeRecruiters: number;
  candidatesAdded: number;
  candidatesWorked: number;
  analysesCompleted: number;
  notesAdded: number;
  statusChanges: number;
  qualified: number;
  submitted: number;
  interviews: number;
  offers: number;
  hired: number;
  rejected: number;
  avgFollowUpHours: number | null;
  inactiveCandidates: number;
}

async function aggregatePeriod(
  tenantId: string,
  period: PeriodBounds,
  recruiterId: string | null
): Promise<Omit<KpiSnapshot, "avgFollowUpHours" | "inactiveCandidates">> {
  const sql = getSql();
  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();

  const rows = (await sql`
    SELECT
      COUNT(DISTINCT a.performed_by_user_id) FILTER (
        WHERE a.performed_by_user_id IS NOT NULL
          AND COALESCE(a.source, 'recruiter') <> 'system'
          AND a.action_type <> 'USER_LOGIN'
      ) AS active_recruiters,
      COUNT(DISTINCT a.candidate_id) FILTER (
        WHERE a.action_type = 'CANDIDATE_CREATED' AND a.candidate_id IS NOT NULL
      ) AS candidates_added,
      COUNT(DISTINCT a.candidate_id) FILTER (
        WHERE a.candidate_id IS NOT NULL
          AND a.action_type = ANY(${MEANINGFUL})
          AND COALESCE(a.source, 'recruiter') <> 'system'
      ) AS candidates_worked,
      COUNT(*) FILTER (WHERE a.action_type = 'ANALYSIS_COMPLETED') AS analyses_completed,
      COUNT(*) FILTER (WHERE a.action_type = 'NOTE_ADDED') AS notes_added,
      COUNT(*) FILTER (WHERE a.action_type = 'STATUS_CHANGED') AS status_changes,
      COUNT(*) FILTER (WHERE a.action_type = 'CANDIDATE_QUALIFIED') AS qualified,
      COUNT(*) FILTER (
        WHERE a.action_type IN ('CANDIDATE_SUBMITTED', 'CANDIDATE_SUBMITTED_TO_JOB')
      ) AS submitted,
      COUNT(*) FILTER (WHERE a.action_type = 'INTERVIEW_SCHEDULED') AS interviews,
      COUNT(*) FILTER (WHERE a.action_type = 'OFFER_EXTENDED') AS offers,
      COUNT(*) FILTER (WHERE a.action_type = 'CANDIDATE_HIRED') AS hired,
      COUNT(*) FILTER (WHERE a.action_type = 'CANDIDATE_REJECTED') AS rejected
    FROM candidate_activity_logs a
    WHERE a.tenant_id = ${tenantId}
      AND a.created_at >= ${fromIso}
      AND a.created_at < ${toIso}
      AND (${recruiterId}::text IS NULL OR a.performed_by_user_id = ${recruiterId})
  `) as Array<Record<string, unknown>>;

  const r = rows[0] ?? {};
  return {
    activeRecruiters: Number(r.active_recruiters ?? 0),
    candidatesAdded: Number(r.candidates_added ?? 0),
    candidatesWorked: Number(r.candidates_worked ?? 0),
    analysesCompleted: Number(r.analyses_completed ?? 0),
    notesAdded: Number(r.notes_added ?? 0),
    statusChanges: Number(r.status_changes ?? 0),
    qualified: Number(r.qualified ?? 0),
    submitted: Number(r.submitted ?? 0),
    interviews: Number(r.interviews ?? 0),
    offers: Number(r.offers ?? 0),
    hired: Number(r.hired ?? 0),
    rejected: Number(r.rejected ?? 0),
  };
}

async function computeAvgFollowUp(
  tenantId: string,
  period: PeriodBounds,
  recruiterId: string | null
): Promise<number | null> {
  const sql = getSql();
  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();

  const rows = (await sql`
    WITH starts AS (
      SELECT
        c.id AS candidate_id,
        COALESCE(
          (
            SELECT MIN(a.created_at)
            FROM candidate_activity_logs a
            WHERE a.candidate_id = c.id
              AND a.tenant_id = ${tenantId}
              AND a.action_type IN ('CANDIDATE_ASSIGNED', 'CANDIDATE_REASSIGNED', 'CANDIDATE_CREATED')
              AND COALESCE(a.source, 'recruiter') <> 'system'
          ),
          c.created_at
        ) AS start_at,
        c.assigned_recruiter_id
      FROM candidates c
      WHERE c.tenant_id = ${tenantId}
    ),
    first_work AS (
      SELECT
        a.candidate_id,
        a.performed_by_user_id,
        MIN(a.created_at) AS first_at
      FROM candidate_activity_logs a
      WHERE a.tenant_id = ${tenantId}
        AND a.candidate_id IS NOT NULL
        AND a.action_type = ANY(${MEANINGFUL})
        AND COALESCE(a.source, 'recruiter') <> 'system'
        AND a.performed_by_user_id IS NOT NULL
        AND a.created_at >= ${fromIso}
        AND a.created_at < ${toIso}
        AND (${recruiterId}::text IS NULL OR a.performed_by_user_id = ${recruiterId})
      GROUP BY a.candidate_id, a.performed_by_user_id
    )
    SELECT EXTRACT(EPOCH FROM (fw.first_at - s.start_at)) * 1000 AS duration_ms
    FROM first_work fw
    JOIN starts s ON s.candidate_id = fw.candidate_id
    WHERE fw.first_at >= s.start_at
      AND (${recruiterId}::text IS NULL OR fw.performed_by_user_id = ${recruiterId})
  `) as Array<{ duration_ms: number | string }>;

  const durations = rows
    .map((r) => Number(r.duration_ms))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return averageFollowUpHours(durations);
}

async function countInactiveCandidates(
  tenantId: string,
  recruiterId: string | null
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS cnt
    FROM candidates c
    WHERE c.tenant_id = ${tenantId}
      AND c.assigned_recruiter_id IS NOT NULL
      AND (${recruiterId}::text IS NULL OR c.assigned_recruiter_id = ${recruiterId})
      AND NOT EXISTS (
        SELECT 1 FROM candidate_activity_logs a
        WHERE a.candidate_id = c.id
          AND a.tenant_id = ${tenantId}
          AND a.created_at >= now() - interval '7 days'
          AND COALESCE(a.source, 'recruiter') <> 'system'
      )
  `) as Array<{ cnt: number }>;
  return Number(rows[0]?.cnt ?? 0);
}

export async function getRecruiterActivityKpis(params: {
  user: AppUser;
  tenantId: string;
  period: PeriodBounds;
  previousPeriod: PeriodBounds;
  recruiterId?: string | null;
}): Promise<{ current: KpiSnapshot; previous: KpiSnapshot }> {
  assertTenantAccess(params.user, params.tenantId);
  const recruiterId = params.recruiterId ?? null;

  const [currentBase, previousBase, avgFollowUp, inactive, prevAvg, prevInactive] =
    await Promise.all([
      aggregatePeriod(params.tenantId, params.period, recruiterId),
      aggregatePeriod(params.tenantId, params.previousPeriod, recruiterId),
      computeAvgFollowUp(params.tenantId, params.period, recruiterId),
      countInactiveCandidates(params.tenantId, recruiterId),
      computeAvgFollowUp(params.tenantId, params.previousPeriod, recruiterId),
      countInactiveCandidates(params.tenantId, recruiterId),
    ]);

  return {
    current: {
      ...currentBase,
      avgFollowUpHours: avgFollowUp,
      inactiveCandidates: inactive,
    },
    previous: {
      ...previousBase,
      avgFollowUpHours: prevAvg,
      inactiveCandidates: prevInactive,
    },
  };
}

export interface RecruiterProductivityRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  assignedCandidates: number;
  candidatesAdded: number;
  candidatesWorked: number;
  analysesCompleted: number;
  notesAdded: number;
  statusChanges: number;
  qualified: number;
  submitted: number;
  interviews: number;
  offers: number;
  hired: number;
  rejected: number;
  avgFollowUpHours: number | null;
  lastActivityAt: string | null;
  productivityScore: number;
}

export async function listRecruiterProductivity(params: {
  user: AppUser;
  tenantId: string;
  period: PeriodBounds;
  recruiterId?: string | null;
  search?: string | null;
  statusFilter?: "active" | "inactive" | "all";
}): Promise<RecruiterProductivityRow[]> {
  assertTenantAccess(params.user, params.tenantId);
  const sql = getSql();
  const fromIso = params.period.from.toISOString();
  const toIso = params.period.to.toISOString();
  const recruiterId = params.recruiterId ?? null;

  const users = await listTenantUsers(params.tenantId, { includeArchived: true });
  let recruiters = users.filter(
    (u) => u.role === "RECRUITER" || u.role === "TENANT_ADMIN" || u.role === "VIEWER"
  );
  if (recruiterId) {
    recruiters = recruiters.filter((u) => u.user_id === recruiterId);
  }
  if (params.statusFilter === "active") {
    recruiters = recruiters.filter((u) => u.status === "ACTIVE");
  } else if (params.statusFilter === "inactive") {
    recruiters = recruiters.filter((u) => u.status !== "ACTIVE");
  }
  if (params.search?.trim()) {
    const q = params.search.trim().toLowerCase();
    recruiters = recruiters.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
    );
  }

  if (recruiters.length === 0) return [];

  const stats = (await sql`
    SELECT
      a.performed_by_user_id AS user_id,
      COUNT(DISTINCT a.candidate_id) FILTER (
        WHERE a.action_type = 'CANDIDATE_CREATED' AND a.candidate_id IS NOT NULL
      ) AS candidates_added,
      COUNT(DISTINCT a.candidate_id) FILTER (
        WHERE a.candidate_id IS NOT NULL
          AND a.action_type = ANY(${MEANINGFUL})
          AND COALESCE(a.source, 'recruiter') <> 'system'
      ) AS candidates_worked,
      COUNT(*) FILTER (WHERE a.action_type = 'ANALYSIS_COMPLETED') AS analyses_completed,
      COUNT(*) FILTER (WHERE a.action_type = 'NOTE_ADDED') AS notes_added,
      COUNT(*) FILTER (WHERE a.action_type = 'STATUS_CHANGED') AS status_changes,
      COUNT(*) FILTER (WHERE a.action_type = 'CANDIDATE_QUALIFIED') AS qualified,
      COUNT(*) FILTER (
        WHERE a.action_type IN ('CANDIDATE_SUBMITTED', 'CANDIDATE_SUBMITTED_TO_JOB')
      ) AS submitted,
      COUNT(*) FILTER (WHERE a.action_type = 'INTERVIEW_SCHEDULED') AS interviews,
      COUNT(*) FILTER (WHERE a.action_type = 'OFFER_EXTENDED') AS offers,
      COUNT(*) FILTER (WHERE a.action_type = 'CANDIDATE_HIRED') AS hired,
      COUNT(*) FILTER (WHERE a.action_type = 'CANDIDATE_REJECTED') AS rejected,
      MAX(a.created_at) AS last_activity_at
    FROM candidate_activity_logs a
    WHERE a.tenant_id = ${params.tenantId}
      AND a.created_at >= ${fromIso}
      AND a.created_at < ${toIso}
      AND a.performed_by_user_id IS NOT NULL
      AND (${recruiterId}::text IS NULL OR a.performed_by_user_id = ${recruiterId})
    GROUP BY a.performed_by_user_id
  `) as Array<Record<string, unknown>>;

  const statsByUser = new Map(stats.map((s) => [s.user_id as string, s]));

  const assigned = (await sql`
    SELECT assigned_recruiter_id AS user_id, COUNT(*)::int AS cnt
    FROM candidates
    WHERE tenant_id = ${params.tenantId}
      AND assigned_recruiter_id IS NOT NULL
    GROUP BY assigned_recruiter_id
  `) as Array<{ user_id: string; cnt: number }>;
  const assignedByUser = new Map(assigned.map((a) => [a.user_id, Number(a.cnt)]));

  const countsList: RecruiterMetricCounts[] = [];
  const draft: Array<{
    user: TenantUserRow;
    counts: RecruiterMetricCounts;
    lastActivityAt: string | null;
    assignedCandidates: number;
    avgFollowUpHours: number | null;
  }> = [];

  for (const user of recruiters) {
    const s = statsByUser.get(user.user_id);
    const counts: RecruiterMetricCounts = {
      candidatesAdded: Number(s?.candidates_added ?? 0),
      candidatesWorked: Number(s?.candidates_worked ?? 0),
      analysesCompleted: Number(s?.analyses_completed ?? 0),
      notesAdded: Number(s?.notes_added ?? 0),
      statusChanges: Number(s?.status_changes ?? 0),
      qualified: Number(s?.qualified ?? 0),
      submitted: Number(s?.submitted ?? 0),
      interviews: Number(s?.interviews ?? 0),
      offers: Number(s?.offers ?? 0),
      hired: Number(s?.hired ?? 0),
      rejected: Number(s?.rejected ?? 0),
    };
    countsList.push(counts);
    draft.push({
      user,
      counts,
      lastActivityAt: (s?.last_activity_at as string) ?? null,
      assignedCandidates: assignedByUser.get(user.user_id) ?? 0,
      avgFollowUpHours: null,
    });
  }

  const maxes: RecruiterMetricCounts = {
    candidatesAdded: Math.max(0, ...countsList.map((c) => c.candidatesAdded)),
    candidatesWorked: Math.max(0, ...countsList.map((c) => c.candidatesWorked)),
    analysesCompleted: Math.max(0, ...countsList.map((c) => c.analysesCompleted)),
    notesAdded: Math.max(0, ...countsList.map((c) => c.notesAdded)),
    statusChanges: Math.max(0, ...countsList.map((c) => c.statusChanges)),
    qualified: Math.max(0, ...countsList.map((c) => c.qualified)),
    submitted: Math.max(0, ...countsList.map((c) => c.submitted)),
    interviews: Math.max(0, ...countsList.map((c) => c.interviews)),
    offers: Math.max(0, ...countsList.map((c) => c.offers)),
    hired: Math.max(0, ...countsList.map((c) => c.hired)),
    rejected: Math.max(0, ...countsList.map((c) => c.rejected)),
  };

  // Follow-up averages per recruiter (batched lightly)
  await Promise.all(
    draft.map(async (row) => {
      row.avgFollowUpHours = await computeAvgFollowUp(
        params.tenantId,
        params.period,
        row.user.user_id
      );
    })
  );

  return draft.map((row) => ({
    userId: row.user.user_id,
    name: row.user.full_name || row.user.email || "Unknown",
    email: row.user.email || "",
    role: row.user.role,
    status: row.user.status,
    lastLoginAt: row.user.last_login_at,
    assignedCandidates: row.assignedCandidates,
    ...row.counts,
    avgFollowUpHours: row.avgFollowUpHours,
    lastActivityAt: row.lastActivityAt,
    productivityScore: computeProductivityScore(row.counts, maxes),
  }));
}

export interface ActivityFeedItem {
  id: string;
  recruiterUserId: string | null;
  recruiterName: string | null;
  candidateId: string | null;
  candidateName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  actionType: string;
  previousValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listActivityFeed(params: {
  user: AppUser;
  tenantId: string;
  period: PeriodBounds;
  recruiterId?: string | null;
  candidateId?: string | null;
  jobId?: string | null;
  actionType?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ items: ActivityFeedItem[]; total: number }> {
  assertTenantAccess(params.user, params.tenantId);
  const sql = getSql();
  const fromIso = params.period.from.toISOString();
  const toIso = params.period.to.toISOString();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 5000);
  const offset = Math.max(params.offset ?? 0, 0);
  const recruiterId = params.recruiterId ?? null;
  const candidateId = params.candidateId ?? null;
  const jobId = params.jobId ?? null;
  const actionType = params.actionType ?? null;

  const countRows = (await sql`
    SELECT COUNT(*)::int AS total
    FROM candidate_activity_logs a
    WHERE a.tenant_id = ${params.tenantId}
      AND a.created_at >= ${fromIso}
      AND a.created_at < ${toIso}
      AND COALESCE(a.source, 'recruiter') <> 'system'
      AND (${recruiterId}::text IS NULL OR a.performed_by_user_id = ${recruiterId})
      AND (${candidateId}::text IS NULL OR a.candidate_id = ${candidateId})
      AND (${jobId}::text IS NULL OR a.job_id = ${jobId})
      AND (${actionType}::text IS NULL OR a.action_type = ${actionType})
  `) as Array<{ total: number }>;

  const rows = (await sql`
    SELECT
      a.id,
      a.performed_by_user_id,
      up.full_name AS recruiter_name,
      a.candidate_id,
      c.full_name AS candidate_name,
      a.job_id,
      w.job_title,
      a.action_type,
      a.previous_value,
      a.new_value,
      a.metadata,
      a.created_at
    FROM candidate_activity_logs a
    LEFT JOIN user_profiles up ON up.user_id = a.performed_by_user_id
    LEFT JOIN candidates c ON c.id = a.candidate_id AND c.tenant_id = a.tenant_id
    LEFT JOIN job_match_workspaces w ON w.id = a.job_id AND w.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${params.tenantId}
      AND a.created_at >= ${fromIso}
      AND a.created_at < ${toIso}
      AND COALESCE(a.source, 'recruiter') <> 'system'
      AND (${recruiterId}::text IS NULL OR a.performed_by_user_id = ${recruiterId})
      AND (${candidateId}::text IS NULL OR a.candidate_id = ${candidateId})
      AND (${jobId}::text IS NULL OR a.job_id = ${jobId})
      AND (${actionType}::text IS NULL OR a.action_type = ${actionType})
    ORDER BY a.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `) as Array<Record<string, unknown>>;

  return {
    total: Number(countRows[0]?.total ?? 0),
    items: rows.map((r) => ({
      id: r.id as string,
      recruiterUserId: (r.performed_by_user_id as string) ?? null,
      recruiterName: (r.recruiter_name as string) ?? null,
      candidateId: (r.candidate_id as string) ?? null,
      candidateName: (r.candidate_name as string) ?? null,
      jobId: (r.job_id as string) ?? null,
      jobTitle: (r.job_title as string) ?? null,
      actionType: r.action_type as string,
      previousValue: (r.previous_value as string) ?? null,
      newValue: (r.new_value as string) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.created_at as string,
    })),
  };
}

export async function getRecruiterDetail(params: {
  user: AppUser;
  tenantId: string;
  recruiterUserId: string;
  period: PeriodBounds;
}): Promise<{
  profile: TenantUserRow | null;
  metrics: RecruiterProductivityRow | null;
  timeline: ActivityFeedItem[];
} | null> {
  assertTenantAccess(params.user, params.tenantId);
  const users = await listTenantUsers(params.tenantId, { includeArchived: true });
  const profile = users.find((u) => u.user_id === params.recruiterUserId) ?? null;
  if (!profile) return null;

  const [rows, timeline] = await Promise.all([
    listRecruiterProductivity({
      user: params.user,
      tenantId: params.tenantId,
      period: params.period,
      recruiterId: params.recruiterUserId,
      statusFilter: "all",
    }),
    listActivityFeed({
      user: params.user,
      tenantId: params.tenantId,
      period: params.period,
      recruiterId: params.recruiterUserId,
      limit: 100,
    }),
  ]);

  return {
    profile,
    metrics: rows[0] ?? null,
    timeline: timeline.items,
  };
}

export interface InactivitySummary {
  noActivity24h: number;
  noActivity3d: number;
  noActivity7d: number;
  assignedWithoutNotes: number;
  samples: Array<{
    id: string;
    fullName: string | null;
    assignedRecruiterName: string | null;
    statusName: string | null;
    lastActivityAt: string | null;
    bucket: string;
  }>;
}

export async function getInactivitySummary(params: {
  user: AppUser;
  tenantId: string;
  recruiterId?: string | null;
}): Promise<InactivitySummary> {
  assertTenantAccess(params.user, params.tenantId);
  const sql = getSql();
  const recruiterId = params.recruiterId ?? null;

  const counts = (await sql`
    WITH last_act AS (
      SELECT candidate_id, MAX(created_at) AS last_at
      FROM candidate_activity_logs
      WHERE tenant_id = ${params.tenantId}
        AND candidate_id IS NOT NULL
        AND COALESCE(source, 'recruiter') <> 'system'
      GROUP BY candidate_id
    )
    SELECT
      COUNT(*) FILTER (
        WHERE COALESCE(la.last_at, c.created_at) < now() - interval '24 hours'
      )::int AS h24,
      COUNT(*) FILTER (
        WHERE COALESCE(la.last_at, c.created_at) < now() - interval '3 days'
      )::int AS d3,
      COUNT(*) FILTER (
        WHERE COALESCE(la.last_at, c.created_at) < now() - interval '7 days'
      )::int AS d7,
      COUNT(*) FILTER (
        WHERE c.assigned_recruiter_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM candidate_notes n
            WHERE n.candidate_id = c.id
              AND n.tenant_id = ${params.tenantId}
              AND n.deleted_at IS NULL
          )
      )::int AS no_notes
    FROM candidates c
    LEFT JOIN last_act la ON la.candidate_id = c.id
    WHERE c.tenant_id = ${params.tenantId}
      AND c.assigned_recruiter_id IS NOT NULL
      AND (${recruiterId}::text IS NULL OR c.assigned_recruiter_id = ${recruiterId})
  `) as Array<Record<string, unknown>>;

  const samples = (await sql`
    WITH last_act AS (
      SELECT candidate_id, MAX(created_at) AS last_at
      FROM candidate_activity_logs
      WHERE tenant_id = ${params.tenantId}
        AND candidate_id IS NOT NULL
        AND COALESCE(source, 'recruiter') <> 'system'
      GROUP BY candidate_id
    )
    SELECT
      c.id,
      c.full_name,
      up.full_name AS assigned_recruiter_name,
      cs.name AS status_name,
      la.last_at AS last_activity_at,
      CASE
        WHEN COALESCE(la.last_at, c.created_at) < now() - interval '7 days' THEN '7d'
        WHEN COALESCE(la.last_at, c.created_at) < now() - interval '3 days' THEN '3d'
        WHEN COALESCE(la.last_at, c.created_at) < now() - interval '24 hours' THEN '24h'
        ELSE 'ok'
      END AS bucket
    FROM candidates c
    LEFT JOIN last_act la ON la.candidate_id = c.id
    LEFT JOIN user_profiles up ON up.user_id = c.assigned_recruiter_id
    LEFT JOIN candidate_statuses cs ON cs.id = c.current_status_id
    WHERE c.tenant_id = ${params.tenantId}
      AND c.assigned_recruiter_id IS NOT NULL
      AND (${recruiterId}::text IS NULL OR c.assigned_recruiter_id = ${recruiterId})
      AND COALESCE(la.last_at, c.created_at) < now() - interval '24 hours'
    ORDER BY COALESCE(la.last_at, c.created_at) ASC
    LIMIT 20
  `) as Array<Record<string, unknown>>;

  const c = counts[0] ?? {};
  return {
    noActivity24h: Number(c.h24 ?? 0),
    noActivity3d: Number(c.d3 ?? 0),
    noActivity7d: Number(c.d7 ?? 0),
    assignedWithoutNotes: Number(c.no_notes ?? 0),
    samples: samples.map((s) => ({
      id: s.id as string,
      fullName: (s.full_name as string) ?? null,
      assignedRecruiterName: (s.assigned_recruiter_name as string) ?? null,
      statusName: (s.status_name as string) ?? null,
      lastActivityAt: (s.last_activity_at as string) ?? null,
      bucket: s.bucket as string,
    })),
  };
}

export function resolveTenantIdForQuery(
  user: AppUser,
  requestedTenantId?: string | null
): string {
  if (user.role === "SUPER_ADMIN") {
    if (!requestedTenantId) {
      throw new AuthError("tenantId is required for super admin queries.", 400);
    }
    return requestedTenantId;
  }
  return tenantIdOf(user);
}
