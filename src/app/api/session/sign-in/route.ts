import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { ok, fail, logServerError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return fail("Enter your email and password.", 400, "MISSING_FIELDS");
    }
    const { error } = await auth.signIn.email({ email, password });
    if (error) {
      // Do not reveal whether the email exists.
      return fail("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }
    return ok({});
  } catch (err) {
    logServerError("sign-in", err);
    return fail("Sign in failed. Please try again.", 500, "SERVER_ERROR");
  }
}
