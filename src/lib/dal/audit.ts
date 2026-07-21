import "server-only";
import { getSql } from "./client";

// Writes a scoped audit entry. Never pass résumé text, images, or secrets here.
export async function audit(entry: {
  actorUserId: string | null;
  tenantId?: string;
  entityType: string;
  entityId: string | null;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO audit_logs (
      actor_user_id, tenant_id, entity_type, entity_id, action,
      previous_value_json, new_value_json
    ) VALUES (
      ${entry.actorUserId}, ${entry.tenantId ?? "default"}, ${entry.entityType},
      ${entry.entityId}, ${entry.action},
      ${entry.previousValue ? JSON.stringify(entry.previousValue) : null},
      ${entry.newValue ? JSON.stringify(entry.newValue) : null}
    )
  `;
}
