import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/dal/workspaces";
import { listWorkspaceCandidates } from "@/lib/dal/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Comparison report focused on requirements coverage and submission readiness,
// not just the percentage (spec §6/§10).
export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const user = await requireUser();
    const ws = await getWorkspace(user, params.workspaceId);
    if (!ws) return fail("Workspace not found.", 404, "NOT_FOUND");
    const rows = await listWorkspaceCandidates(user, params.workspaceId);

    const header = [
      "Rank",
      "Candidate",
      "Match Score",
      "Match Category",
      "Mandatory Confirmed",
      "Needs Verification",
      "Clearly Not Met",
      "Submission Readiness",
      "Recommended Action",
      "Recruiter Decision",
      "Analysis Status",
      "Last Updated",
    ];
    const lines = [header.map(csvCell).join(",")];
    rows.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          r.full_name ?? "Unnamed candidate",
          r.match_score ?? "",
          r.match_category ?? "",
          r.mandatory_confirmed ?? "",
          r.mandatory_verify ?? "",
          r.mandatory_not_met ?? "",
          r.submission_readiness ?? "",
          r.recommended_action ?? "",
          r.disposition ?? "",
          r.status,
          r.analyzed_at ?? r.updated_at,
        ]
          .map(csvCell)
          .join(",")
      );
    });

    const csv = lines.join("\n");
    const safeTitle = (ws.job_title ?? "workspace").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comparison-${safeTitle}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail("Could not generate the report.", 500, "SERVER_ERROR");
  }
}
