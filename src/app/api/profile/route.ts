import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { updateOwnFullName } from "@/lib/dal/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Update the current user's display name. */
export async function PATCH(req: NextRequest) {
  return withUser("profile.patch", async (user) => {
    const body = (await req.json().catch(() => ({}))) as { full_name?: string };
    const fullName = typeof body.full_name === "string" ? body.full_name : "";
    try {
      const result = await updateOwnFullName({ user, fullName });
      return ok({ full_name: result.full_name });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update your name.";
      return fail(message, 400, "BAD_REQUEST");
    }
  });
}
