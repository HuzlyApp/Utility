import { NextRequest } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { ok, fail } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import { percentChange, KPI_DEFINITIONS } from "@/lib/recruiter-activity";
import { getRecruiterActivityKpis } from "@/lib/dal/recruiter-activity";
import { parseActivityQuery } from "@/lib/recruiter-activity-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser("recruiter-activity.kpis", async (user) => {
    try {
      const q = parseActivityQuery(req, user);
      const { current, previous } = await getRecruiterActivityKpis({
        user: q.queryUser,
        tenantId: q.tenantId,
        period: { from: q.range.from, to: q.range.to },
        previousPeriod: {
          from: q.range.previousFrom,
          to: q.range.previousTo,
        },
        recruiterId: q.scopedRecruiterId,
      });

      const withDelta = (key: keyof typeof current) => {
        const cur = current[key];
        const prev = previous[key];
        const curNum = cur == null ? 0 : Number(cur);
        const prevNum = prev == null ? 0 : Number(prev);
        return {
          value: cur,
          previous: prev,
          changePercent: percentChange(curNum, prevNum),
        };
      };

      return ok({
        range: {
          from: q.range.from.toISOString(),
          to: q.range.to.toISOString(),
          previousFrom: q.range.previousFrom.toISOString(),
          previousTo: q.range.previousTo.toISOString(),
          preset: q.preset,
        },
        definitions: KPI_DEFINITIONS,
        kpis: {
          activeRecruiters: withDelta("activeRecruiters"),
          candidatesAdded: withDelta("candidatesAdded"),
          candidatesWorked: withDelta("candidatesWorked"),
          analysesCompleted: withDelta("analysesCompleted"),
          notesAdded: withDelta("notesAdded"),
          statusChanges: withDelta("statusChanges"),
          qualified: withDelta("qualified"),
          submitted: withDelta("submitted"),
          interviews: withDelta("interviews"),
          offers: withDelta("offers"),
          hired: withDelta("hired"),
          rejected: withDelta("rejected"),
          avgFollowUpHours: withDelta("avgFollowUpHours"),
          inactiveCandidates: withDelta("inactiveCandidates"),
        },
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.message, err.status, "FORBIDDEN");
      }
      if (err instanceof Error && err.message.includes("Custom date")) {
        return fail(err.message, 400, "INVALID_RANGE");
      }
      throw err;
    }
  });
}
