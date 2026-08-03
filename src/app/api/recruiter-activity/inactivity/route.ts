import { NextRequest } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { ok, fail } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import { getInactivitySummary } from "@/lib/dal/recruiter-activity";
import { parseActivityQuery } from "@/lib/recruiter-activity-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser("recruiter-activity.inactivity", async (user) => {
    try {
      const q = parseActivityQuery(req, user);
      const summary = await getInactivitySummary({
        user: q.queryUser,
        tenantId: q.tenantId,
        recruiterId: q.scopedRecruiterId,
      });
      return ok({ summary });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
