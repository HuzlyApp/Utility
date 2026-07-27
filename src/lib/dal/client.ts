import "server-only";
import { neon } from "@neondatabase/serverless";
import { config, persistenceEnabled } from "@/lib/config";

type SqlClient = ReturnType<typeof neon>;
let sql: SqlClient | null = null;

const MAX_QUERY_ATTEMPTS = 3;
const RETRYABLE_DB_ERROR = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|ENOTFOUND/i;

function isRetryableDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const parts = [err.message];
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) parts.push(cause.message);
  return RETRYABLE_DB_ERROR.test(parts.join(" "));
}

async function withQueryRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_QUERY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === MAX_QUERY_ATTEMPTS - 1;
      if (isLastAttempt || !isRetryableDbError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError;
}

function wrapSqlClient(base: SqlClient): SqlClient {
  return new Proxy(base, {
    apply(target, _thisArg, args) {
      return withQueryRetry(() => Reflect.apply(target, null, args));
    },
  }) as SqlClient;
}

// Returns the Neon SQL tagged-template client. The dashboard requires
// persistence, so this throws if DATABASE_URL is not configured.
export function getSql(): SqlClient {
  if (!persistenceEnabled()) {
    throw new Error("DATABASE_URL is not configured; persistence is required.");
  }
  if (!sql) {
    const base = neon(config.databaseUrl, {
      // Avoid stale connection reuse in long-lived Next.js dev/prod processes.
      fetchOptions: { cache: "no-store" },
    });
    sql = wrapSqlClient(base as SqlClient);
  }
  return sql;
}
