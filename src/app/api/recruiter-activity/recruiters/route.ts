import { NextRequest } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { ok, fail } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import { PRODUCTIVITY_SCORE_TOOLTIP } from "@/lib/recruiter-activity";
import { listRecruiterProductivity } from "@/lib/dal/recruiter-activity";
import { parseActivityQuery } from "@/lib/recruiter-activity-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser("recruiter-activity.recruiters", async (user) => {
    try {
      const q = parseActivityQuery(req, user);
      const statusFilter =
        q.statusFilter === "active" || q.statusFilter === "inactive"
          ? q.statusFilter
          : "all";

      const rows = await listRecruiterProductivity({
        user: q.queryUser,
        tenantId: q.tenantId,
        period: { from: q.range.from, to: q.range.to },
        recruiterId: q.scopedRecruiterId,
        search: q.search,
        statusFilter,
      });

      return ok({
        recruiters: rows,
        scoreTooltip: PRODUCTIVITY_SCORE_TOOLTIP,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
