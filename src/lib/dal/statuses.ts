import "server-only";
import { getSql } from "./client";
import { AuthError, type AppUser } from "@/lib/auth/session";
import { canManageTenant } from "@/lib/auth/rbac";
import { audit } from "./audit";
import type { CandidateStatusRow } from "./types";

export type CandidateStatus = CandidateStatusRow;

function tenantIdOf(user: AppUser): string {
  if (!user.tenantId) throw new AuthError("Tenant context is required.", 403);
  return user.tenantId;
}

function assertCanManageStatuses(user: AppUser) {
  if (!canManageTenant(user.role)) {
    throw new AuthError("Only tenant admins can manage status options.", 403);
  }
}

export async function listCandidateStatuses(
  user: AppUser,
  opts?: { includeInactive?: boolean }
): Promise<CandidateStatus[]> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const includeInactive = opts?.includeInactive ?? false;
  const rows = (await sql`
    SELECT *
    FROM candidate_statuses
    WHERE tenant_id = ${tenantId}
      AND (${includeInactive} OR is_active = true)
    ORDER BY display_order ASC, name ASC
  `) as CandidateStatus[];
  return rows;
}

export async function getDefaultStatusId(tenantId: string): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM candidate_statuses
    WHERE tenant_id = ${tenantId} AND is_default = true AND is_active = true
    ORDER BY display_order ASC
    LIMIT 1
  `) as { id: string }[];
  if (rows[0]) return rows[0].id;
  const fallback = (await sql`
    SELECT id FROM candidate_statuses
    WHERE tenant_id = ${tenantId} AND is_active = true
    ORDER BY display_order ASC
    LIMIT 1
  `) as { id: string }[];
  return fallback[0]?.id ?? null;
}

/** Seeds default CRM statuses for a newly created tenant (idempotent). */
export async function seedDefaultStatusesForTenant(tenantId: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO candidate_statuses (tenant_id, name, color, display_order, is_default, is_active)
    SELECT ${tenantId}, s.name, s.color, s.display_order, s.is_default, true
    FROM (
      VALUES
        ('New / Not Contacted', '#9ca3af', 10, true),
        ('Attempted Contact', '#7dd3fc', 20, false),
        ('Unreachable', '#d4a574', 30, false),
        ('Initial Screening Complete', '#60a5fa', 40, false),
        ('Qualified-Ready for 2nd Interview', '#c4b5fd', 50, false),
        ('Approved -Upload to Portal', '#94a3b8', 60, false),
        ('Disqualified / Not a Fit', '#fca5a5', 70, false),
        ('Follow-up Needed', '#fbbf24', 80, false),
        ('Candidate Withdrew', '#f9a8d4', 90, false),
        ('Profile Uploaded', '#bae6fd', 100, false),
        ('Candidate selected', '#166534', 110, false),
        ('Candidate Rejected', '#d1d5db', 120, false),
        ('Callback - not available', '#5b21b6', 130, false),
        ('Rejected After 2nd Interview', '#991b1b', 140, false)
    ) AS s(name, color, display_order, is_default)
    WHERE NOT EXISTS (
      SELECT 1 FROM candidate_statuses cs
      WHERE cs.tenant_id = ${tenantId} AND lower(cs.name) = lower(s.name)
    )
  `;
}

export async function getStatusById(
  user: AppUser,
  statusId: string
): Promise<CandidateStatus | null> {
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const rows = (await sql`
    SELECT * FROM candidate_statuses
    WHERE id = ${statusId} AND tenant_id = ${tenantId}
  `) as CandidateStatus[];
  return rows[0] ?? null;
}

export async function createCandidateStatus(
  user: AppUser,
  input: {
    name: string;
    color?: string | null;
    displayOrder?: number;
    isDefault?: boolean;
  }
): Promise<CandidateStatus> {
  assertCanManageStatuses(user);
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const name = input.name.trim();
  if (!name) throw new AuthError("Status name is required.", 400);

  const dup = (await sql`
    SELECT id FROM candidate_statuses
    WHERE tenant_id = ${tenantId} AND lower(name) = lower(${name})
    LIMIT 1
  `) as { id: string }[];
  if (dup.length > 0) {
    throw new AuthError("A status with this name already exists.", 409);
  }

  const maxOrder = (await sql`
    SELECT COALESCE(MAX(display_order), 0) AS max_order
    FROM candidate_statuses WHERE tenant_id = ${tenantId}
  `) as { max_order: number }[];
  const displayOrder = input.displayOrder ?? Number(maxOrder[0]?.max_order ?? 0) + 10;

  if (input.isDefault) {
    await sql`
      UPDATE candidate_statuses SET is_default = false, updated_at = now()
      WHERE tenant_id = ${tenantId} AND is_default = true
    `;
  }

  const rows = (await sql`
    INSERT INTO candidate_statuses (
      tenant_id, name, color, display_order, is_default, is_active, created_by_user_id
    ) VALUES (
      ${tenantId}, ${name}, ${input.color ?? null}, ${displayOrder},
      ${input.isDefault ?? false}, true, ${user.id}
    )
    RETURNING *
  `) as CandidateStatus[];

  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate_status",
    entityId: rows[0].id,
    action: "STATUS_OPTION_CREATED",
    newValue: { name },
  });

  return rows[0];
}

export async function updateCandidateStatus(
  user: AppUser,
  statusId: string,
  input: {
    name?: string;
    color?: string | null;
    displayOrder?: number;
    isActive?: boolean;
    isDefault?: boolean;
  }
): Promise<CandidateStatus | null> {
  assertCanManageStatuses(user);
  const existing = await getStatusById(user, statusId);
  if (!existing) return null;

  const sql = getSql();
  const tenantId = tenantIdOf(user);
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new AuthError("Status name is required.", 400);

  if (input.name !== undefined && name.toLowerCase() !== existing.name.toLowerCase()) {
    const dup = (await sql`
      SELECT id FROM candidate_statuses
      WHERE tenant_id = ${tenantId}
        AND lower(name) = lower(${name})
        AND id <> ${statusId}
      LIMIT 1
    `) as { id: string }[];
    if (dup.length > 0) {
      throw new AuthError("A status with this name already exists.", 409);
    }
  }

  const isDefault = input.isDefault ?? existing.is_default;
  if (isDefault) {
    await sql`
      UPDATE candidate_statuses SET is_default = false, updated_at = now()
      WHERE tenant_id = ${tenantId} AND is_default = true AND id <> ${statusId}
    `;
  }

  // Do not allow deactivating the only default without assigning another;
  // if deactivating the default, clear is_default.
  let nextDefault = isDefault;
  let nextActive = input.isActive ?? existing.is_active;
  if (!nextActive && nextDefault) {
    throw new AuthError(
      "This status is currently the default. Set another default status before deactivating it.",
      400
    );
  }

  if (input.isActive === false && existing.is_active) {
    const activeCount = (await sql`
      SELECT COUNT(*)::int AS count
      FROM candidate_statuses
      WHERE tenant_id = ${tenantId} AND is_active = true
    `) as { count: number }[];
    if (Number(activeCount[0]?.count ?? 0) <= 1) {
      throw new AuthError("At least one active candidate status is required.", 400);
    }
  }

  const rows = (await sql`
    UPDATE candidate_statuses SET
      name = ${name},
      color = ${input.color !== undefined ? input.color : existing.color},
      display_order = ${input.displayOrder ?? existing.display_order},
      is_active = ${nextActive},
      is_default = ${nextDefault},
      updated_at = now()
    WHERE id = ${statusId} AND tenant_id = ${tenantId}
    RETURNING *
  `) as CandidateStatus[];

  const action =
    existing.is_active && !nextActive
      ? "STATUS_OPTION_DEACTIVATED"
      : !existing.is_active && nextActive
        ? "STATUS_OPTION_ACTIVATED"
        : "STATUS_OPTION_UPDATED";

  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate_status",
    entityId: statusId,
    action,
    previousValue: {
      name: existing.name,
      is_active: existing.is_active,
      is_default: existing.is_default,
    },
    newValue: {
      name,
      is_active: nextActive,
      is_default: nextDefault,
      admin_name: user.name,
    },
  });

  return rows[0] ?? null;
}

export async function reorderCandidateStatuses(
  user: AppUser,
  orderedIds: string[]
): Promise<void> {
  assertCanManageStatuses(user);
  const sql = getSql();
  const tenantId = tenantIdOf(user);
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    await sql`
      UPDATE candidate_statuses
      SET display_order = ${(i + 1) * 10}, updated_at = now()
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `;
  }
  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate_status",
    entityId: null,
    action: "STATUS_OPTIONS_REORDERED",
    newValue: { orderedIds },
  });
}

export async function countCandidatesWithStatus(
  tenantId: string,
  statusId: string
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM candidates
    WHERE tenant_id = ${tenantId} AND current_status_id = ${statusId}
  `) as { count: number }[];
  return Number(rows[0]?.count ?? 0);
}

/**
 * Hard-deletes an unused, non-default status. Blocks when the status is default,
 * assigned to candidates, or the last active status for the tenant.
 */
export async function deleteCandidateStatus(
  user: AppUser,
  statusId: string
): Promise<{ deleted: true; name: string }> {
  assertCanManageStatuses(user);
  const existing = await getStatusById(user, statusId);
  if (!existing) {
    throw new AuthError("Status not found.", 404);
  }

  const sql = getSql();
  const tenantId = tenantIdOf(user);

  if (existing.is_default) {
    throw new AuthError(
      "This status is currently the default. Set another default status before deleting it.",
      400
    );
  }

  const assignedCount = await countCandidatesWithStatus(tenantId, statusId);
  if (assignedCount > 0) {
    throw new AuthError(
      `This status is assigned to ${assignedCount} candidate${assignedCount === 1 ? "" : "s"}. Reassign those candidates or deactivate the status instead.`,
      400
    );
  }

  if (existing.is_active) {
    const activeCount = (await sql`
      SELECT COUNT(*)::int AS count
      FROM candidate_statuses
      WHERE tenant_id = ${tenantId} AND is_active = true
    `) as { count: number }[];
    if (Number(activeCount[0]?.count ?? 0) <= 1) {
      throw new AuthError("At least one active candidate status is required.", 400);
    }
  }

  await sql`
    DELETE FROM candidate_statuses
    WHERE id = ${statusId} AND tenant_id = ${tenantId}
  `;

  await audit({
    actorUserId: user.id,
    tenantId,
    entityType: "candidate_status",
    entityId: statusId,
    action: "STATUS_OPTION_DELETED",
    previousValue: {
      name: existing.name,
      color: existing.color,
      is_active: existing.is_active,
      is_default: existing.is_default,
      admin_name: user.name,
    },
  });

  return { deleted: true, name: existing.name };
}
