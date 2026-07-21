import { NextResponse } from "next/server";

// Consistent JSON responses. User-facing messages never include stack traces or
// raw provider errors (spec section 25).
export function ok<T extends object>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status }
  );
}

// Log securely on the server only. Never echo sensitive content to the client.
export function logServerError(context: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[candidate-match] ${context}: ${message}`);
}

// Operational metadata logging only (spec §28): IDs, counts, status, timing.
// Never log résumé/job content, recruiter notes, secrets, or PII.
export function logOperational(meta: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.info(`[candidate-match] ${JSON.stringify(meta)}`);
}
