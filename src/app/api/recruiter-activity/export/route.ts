import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api-helpers";
import { fail } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import {
  activityRowsToCsv,
  productivityRowsToCsv,
} from "@/lib/recruiter-activity";
import {
  listActivityFeed,
  listRecruiterProductivity,
} from "@/lib/dal/recruiter-activity";
import { parseActivityQuery } from "@/lib/recruiter-activity-api";
import { getTenantById } from "@/lib/dal/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withUser("recruiter-activity.export", async (user) => {
    try {
      if (user.role !== "TENANT_ADMIN" && user.role !== "SUPER_ADMIN") {
        return fail("Only admins can export recruiter activity reports.", 403, "FORBIDDEN");
      }

      const q = parseActivityQuery(req, user);
      const tenant = await getTenantById(q.tenantId);
      const tenantName = tenant?.name ?? q.tenantId;

      if (q.exportType === "activity") {
        const { items } = await listActivityFeed({
          user: q.queryUser,
          tenantId: q.tenantId,
          period: { from: q.range.from, to: q.range.to },
          recruiterId: q.scopedRecruiterId,
          candidateId: q.candidateId,
          jobId: q.jobId,
          actionType: q.actionType,
          limit: 5000,
        });
        const csv = activityRowsToCsv(
          items.map((item) => ({
            recruiter_name: item.recruiterName ?? "",
            recruiter_email: "",
            activity_type: item.actionType,
            candidate: item.candidateName ?? "",
            job: item.jobTitle ?? "",
            previous_value: item.previousValue ?? "",
            new_value: item.newValue ?? "",
            timestamp: item.createdAt,
            tenant: tenantName,
            candidate_id: item.candidateId ?? "",
            job_id: item.jobId ?? "",
            activity_id: item.id,
          }))
        );
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="recruiter-activity.csv"`,
          },
        });
      }

      const rows = await listRecruiterProductivity({
        user: q.queryUser,
        tenantId: q.tenantId,
        period: { from: q.range.from, to: q.range.to },
        recruiterId: q.scopedRecruiterId,
        search: q.search,
        statusFilter:
          q.statusFilter === "active" || q.statusFilter === "inactive"
            ? q.statusFilter
            : "all",
      });

      if (rows.length === 0) {
        return fail("No data to export for the current filters.", 400, "EMPTY_EXPORT");
      }

      const csv = productivityRowsToCsv(
        rows.map((r) => ({
          recruiter_name: r.name,
          recruiter_email: r.email,
          role: r.role,
          assigned_candidates: r.assignedCandidates,
          candidates_added: r.candidatesAdded,
          candidates_worked: r.candidatesWorked,
          analyses_completed: r.analysesCompleted,
          notes_added: r.notesAdded,
          status_changes: r.statusChanges,
          qualified: r.qualified,
          submitted: r.submitted,
          interviews: r.interviews,
          offers: r.offers,
          hired: r.hired,
          rejected: r.rejected,
          avg_follow_up_hours:
            r.avgFollowUpHours == null ? "" : String(r.avgFollowUpHours),
          last_activity: r.lastActivityAt ?? "",
          productivity_score: String(r.productivityScore),
        }))
      );

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="recruiter-productivity.csv"`,
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
