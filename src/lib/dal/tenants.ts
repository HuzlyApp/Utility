import "server-only";
import { getSql } from "./client";
import { audit } from "./audit";
import { seedDefaultStatusesForTenant } from "./statuses";
import type { AppUser } from "@/lib/auth/session";

export type TenantStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  settings_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function asSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function getTenantById(id: string): Promise<TenantRecord | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name, slug, status, settings_json, created_at, updated_at, archived_at
    FROM tenants
    WHERE id = ${id}
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: row.status as TenantStatus,
    settings_json: asSettings(row.settings_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    archived_at: row.archived_at ? String(row.archived_at) : null,
  };
}

export async function getTenantBySlug(slug: string): Promise<TenantRecord | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name, slug, status, settings_json, created_at, updated_at, archived_at
    FROM tenants
    WHERE slug = ${slug}
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: row.status as TenantStatus,
    settings_json: asSettings(row.settings_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    archived_at: row.archived_at ? String(row.archived_at) : null,
  };
}

export async function listTenants(): Promise<
  Array<
    TenantRecord & {
      user_count: number;
      workspace_count: number;
      candidate_count: number;
      analysis_count: number;
      last_activity_at: string | null;
    }
  >
> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      t.id, t.name, t.slug, t.status, t.settings_json, t.created_at, t.updated_at, t.archived_at,
      COALESCE((SELECT COUNT(*) FROM user_profiles up WHERE up.tenant_id = t.id), 0) AS user_count,
      COALESCE((SELECT COUNT(*) FROM job_match_workspaces w WHERE w.tenant_id = t.id), 0) AS workspace_count,
      COALESCE((SELECT COUNT(*) FROM candidates c WHERE c.tenant_id = t.id), 0) AS candidate_count,
      COALESCE((SELECT COUNT(*) FROM candidate_match_analyses a WHERE a.tenant_id = t.id), 0) AS analysis_count,
      (
        SELECT MAX(x.ts) FROM (
          SELECT MAX(a.updated_at) AS ts FROM candidate_match_analyses a WHERE a.tenant_id = t.id
          UNION ALL
          SELECT MAX(w.updated_at) AS ts FROM job_match_workspaces w WHERE w.tenant_id = t.id
        ) x
      ) AS last_activity_at
    FROM tenants t
    ORDER BY t.created_at DESC
  `) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: row.status as TenantStatus,
    settings_json: asSettings(row.settings_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    user_count: Number(row.user_count ?? 0),
    workspace_count: Number(row.workspace_count ?? 0),
    candidate_count: Number(row.candidate_count ?? 0),
    analysis_count: Number(row.analysis_count ?? 0),
    last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
  }));
}

export async function createTenant(params: {
  actor: AppUser;
  name: string;
  slug: string;
  status?: TenantStatus;
  settings?: Record<string, unknown>;
}): Promise<TenantRecord> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO tenants (name, slug, status, settings_json, created_by)
    VALUES (
      ${params.name.trim()},
      ${params.slug.trim().toLowerCase()},
      ${params.status ?? "ACTIVE"},
      ${JSON.stringify(params.settings ?? {})},
      ${params.actor.id}
    )
    RETURNING id, name, slug, status, settings_json, created_at, updated_at, archived_at
  `) as Array<Record<string, unknown>>;
  const tenant = rows[0] as Record<string, unknown>;

  await audit({
    actorUserId: params.actor.id,
    tenantId: params.actor.tenantId ?? undefined,
    entityType: "tenant",
    entityId: String(tenant.id),
    action: "TENANT_CREATED",
    newValue: {
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
    },
  });

  await seedDefaultStatusesForTenant(String(tenant.id));

  return {
    id: String(tenant.id),
    name: String(tenant.name),
    slug: String(tenant.slug),
    status: tenant.status as TenantStatus,
    settings_json: asSettings(tenant.settings_json),
    created_at: String(tenant.created_at),
    updated_at: String(tenant.updated_at),
    archived_at: tenant.archived_at ? String(tenant.archived_at) : null,
  };
}

export async function updateTenantName(params: {
  actor: AppUser;
  tenantId: string;
  name: string;
}): Promise<boolean> {
  const sql = getSql();
  const current = await getTenantById(params.tenantId);
  if (!current) return false;
  const name = params.name.trim();
  if (!name || name === current.name) return true;

  const rows = (await sql`
    UPDATE tenants
    SET name = ${name}, updated_at = now()
    WHERE id = ${params.tenantId}
    RETURNING id
  `) as Array<{ id: string }>;
  if (rows.length === 0) return false;

  await audit({
    actorUserId: params.actor.id,
    tenantId: params.tenantId,
    entityType: "tenant",
    entityId: params.tenantId,
    action: "TENANT_RENAMED",
    previousValue: { name: current.name },
    newValue: { name },
  });
  return true;
}

export async function updateTenantStatus(params: {
  actor: AppUser;
  tenantId: string;
  status: TenantStatus;
}): Promise<boolean> {
  const sql = getSql();
  const current = await getTenantById(params.tenantId);
  if (!current) return false;
  const status = params.status;
  const rows = (await sql`
    UPDATE tenants
    SET
      status = ${status},
      archived_at = CASE WHEN ${status} = 'ARCHIVED' THEN now() ELSE archived_at END,
      updated_at = now()
    WHERE id = ${params.tenantId}
    RETURNING id
  `) as Array<{ id: string }>;
  if (rows.length === 0) return false;

  await audit({
    actorUserId: params.actor.id,
    tenantId: params.tenantId,
    entityType: "tenant",
    entityId: params.tenantId,
    action:
      status === "SUSPENDED"
        ? "TENANT_SUSPENDED"
        : status === "ACTIVE"
          ? "TENANT_REACTIVATED"
          : "TENANT_ARCHIVED",
    previousValue: { status: current.status },
    newValue: { status },
  });
  return true;
}
