import { NextRequest } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { ok, fail } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import { formatFeedDescription, formatRelativeTime } from "@/lib/recruiter-activity";
import { listActivityFeed } from "@/lib/dal/recruiter-activity";
import { parseActivityQuery } from "@/lib/recruiter-activity-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser("recruiter-activity.feed", async (user) => {
    try {
      const q = parseActivityQuery(req, user);
      const limit = Math.min(Math.max(q.limit, 1), 100);
      const page = q.page > 0 ? q.page : 1;
      const offset = q.offset > 0 ? q.offset : (page - 1) * limit;

      const { items, total } = await listActivityFeed({
        user: q.queryUser,
        tenantId: q.tenantId,
        period: { from: q.range.from, to: q.range.to },
        recruiterId: q.scopedRecruiterId,
        candidateId: q.candidateId,
        jobId: q.jobId,
        actionType: q.actionType,
        limit,
        offset,
      });

      const totalPages = Math.max(1, Math.ceil(total / limit));

      return ok({
        items: items.map((item) => ({
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
                : null,
          }),
          relativeTime: formatRelativeTime(item.createdAt),
        })),
        pagination: {
          page,
          limit,
          offset,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      throw err;
    }
  });
}
