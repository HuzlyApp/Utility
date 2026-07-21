import "server-only";
import { requireUser, AuthError, type AppUser } from "@/lib/auth/session";
import { fail, logServerError } from "@/lib/http";
import { NextResponse } from "next/server";

// Wraps a route handler with server-side session validation and consistent
// error mapping. Returns 401 when unauthenticated, 403 when unauthorized.
export async function withUser(
  context: string,
  fn: (user: AppUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return await fn(user);
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.message, err.status, err.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
    }
    logServerError(context, err);
    return fail("Something went wrong. Please try again.", 500, "SERVER_ERROR");
  }
}
