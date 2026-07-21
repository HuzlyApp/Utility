import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { ok, logServerError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Always responds with a generic success message so the existence of an account
// is never revealed (spec §14). Delivery depends on the Neon Auth email config.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = (body.email ?? "").trim();
    if (email) {
      const fn =
        (auth as unknown as {
          requestPasswordReset?: (a: { email: string; redirectTo?: string }) => Promise<unknown>;
          forgetPassword?: (a: { email: string; redirectTo?: string }) => Promise<unknown>;
        });
      try {
        if (fn.requestPasswordReset) {
          await fn.requestPasswordReset({ email, redirectTo: "/change-password" });
        } else if (fn.forgetPassword) {
          await fn.forgetPassword({ email, redirectTo: "/change-password" });
        }
      } catch (inner) {
        logServerError("forgot-password-provider", inner);
      }
    }
  } catch (err) {
    logServerError("forgot-password", err);
  }
  return ok({
    message:
      "If an account exists for that email, a password reset link has been sent.",
  });
}
