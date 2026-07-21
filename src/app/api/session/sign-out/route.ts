import { auth } from "@/lib/auth/server";
import { ok, logServerError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await auth.signOut();
  } catch (err) {
    logServerError("sign-out", err);
  }
  return ok({});
}
