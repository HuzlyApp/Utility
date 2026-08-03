import { NextRequest } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { ok, fail } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import {
  canViewRecruiterActivity,
  formatFeedDescription,
  formatRelativeTime,
} from "@/lib/recruiter-activity";
import { getRecruiterDetail } from "@/lib/dal/recruiter-activity";
import { parseActivityQuery } from "@/lib/recruiter-activity-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  return withUser("recruiter-activity.recruiter-detail", async (user) => {
    try {
      const q = parseActivityQuery(req, user);
      const allowed = canViewRecruiterActivity({
        viewerRole: user.role,
        viewerUserId: user.id,
        viewerTenantId: user.role === "SUPER_ADMIN" ? q.tenantId : user.tenantId,
        targetRecruiterId: params.userId,
        targetTenantId: q.tenantId,
      });
      if (!allowed) {
        return fail("Forbidden", 403, "FORBIDDEN");
      }

      const detail = await getRecruiterDetail({
        user: q.queryUser,
        tenantId: q.tenantId,
        recruiterUserId: params.userId,
        period: { from: q.range.from, to: q.range.to },
      });
      if (!detail) {
        return fail("Recruiter not found", 404, "NOT_FOUND");
      }

      const timeline = detail.timeline.map((item) => ({
        ...item,
        description: formatFeedDescription({
          recruiterName: item.recruiterName || "Someone",
          actionType: item.actionType,
          candidateName: item.candidateName,
          jobTitle: item.jobTitle,
          previousValue: item.previousValue,
          newValue: item.newValue,
          matchScore:
            typeof item.metadata?.match_score === "number"
              ? item.metadata.match_score
              : item.newValue && !Number.isNaN(Number(item.newValue))
                ? Number(item.newValue)
                : null,
        }),
        relativeTime: formatRelativeTime(item.createdAt),
      }));

      return ok({
        profile: detail.profile,
        metrics: detail.metrics,
        timeline,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
