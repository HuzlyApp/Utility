import "server-only";
import { neon } from "@neondatabase/serverless";
import { config, persistenceEnabled } from "@/lib/config";

type SqlClient = ReturnType<typeof neon>;
let sql: SqlClient | null = null;

// Returns the Neon SQL tagged-template client. The dashboard requires
// persistence, so this throws if DATABASE_URL is not configured.
export function getSql(): SqlClient {
  if (!persistenceEnabled()) {
    throw new Error("DATABASE_URL is not configured; persistence is required.");
  }
  if (!sql) sql = neon(config.databaseUrl);
  return sql;
}
