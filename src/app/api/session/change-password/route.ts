import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { requireUser, clearMustChangePassword, AuthError } from "@/lib/auth/session";
import { ok, fail, logServerError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (!currentPassword || !newPassword) {
      return fail("Enter your current and new password.", 400, "MISSING_FIELDS");
    }
    if (newPassword.length < 8) {
      return fail("New password must be at least 8 characters.", 400, "WEAK_PASSWORD");
    }
    const { error } = await auth.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      return fail("Could not change password. Check your current password.", 400, "CHANGE_FAILED");
    }
    await clearMustChangePassword(user.id);
    return ok({});
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    logServerError("change-password", err);
    return fail("Could not change password. Please try again.", 500, "SERVER_ERROR");
  }
}
