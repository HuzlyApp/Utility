import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/dal/workspaces";
import { listWorkspaceCandidates } from "@/lib/dal/candidates";
import { listCandidateStatuses } from "@/lib/dal/statuses";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/primitives";
import { DeleteJobButton } from "@/components/jobs/delete-job-button";
import { AddCandidates } from "@/components/workspace/add-candidates";
import { RankingTable } from "@/components/workspace/ranking-table";
import { JobWorkspaceLayout } from "@/components/workspace/job-workspace-layout";
import { jobRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: { jobId: string };
  searchParams: { edit?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Legacy edit deep-link → dedicated edit route.
  if (searchParams.edit) {
    redirect(jobRoutes.edit(params.jobId));
  }

  const ws = await getWorkspace(user, params.jobId);
  if (!ws) notFound();

  const [candidates, statuses] = await Promise.all([
    listWorkspaceCandidates(user, params.jobId),
    listCandidateStatuses(user),
  ]);
  const sr = ws.structured_requirements ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
              Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm text-slate-500">Workspace</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {ws.job_title || "Untitled job"}
          </h1>
          <p className="text-sm text-slate-500">
            {ws.msp_or_client || "—"}
            {ws.job_ref ? ` · Job ID ${ws.job_ref}` : ""}
            {ws.specialty ? ` · ${ws.specialty}` : ""}
            {ws.location ? ` · ${ws.location}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={ws.job_status === "OPEN" ? "green" : "slate"}>{ws.job_status}</Badge>
          <Link
            href={jobRoutes.edit(ws.id)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit Job
          </Link>
          <a
            href={`/api/workspaces/${ws.id}/report`}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Download Comparison Report
          </a>
          <DeleteJobButton
            workspaceId={ws.id}
            jobTitle={ws.job_title}
            candidateCount={candidates.length}
            redirectToDashboard
          />
        </div>
      </div>

      <JobWorkspaceLayout
        userId={user.id}
        main={
          <>
            <div id="add-candidates">
              <AddCandidates workspaceId={ws.id} />
            </div>

            <Card>
              <CardHeader
                title="Candidate ranking"
                description="Sorted best-first. Analyze ready candidates, then compare and decide."
              />
              <CardBody>
                <RankingTable
                  workspaceId={ws.id}
                  initial={candidates}
                  statuses={statuses}
                  currentUserId={user.id}
                  currentUserRole={user.role}
                />
              </CardBody>
            </Card>
          </>
        }
        sidebar={{
          specialty: sr.specialty || ws.specialty,
          department: ws.department,
          location: ws.location,
          shift: ws.shift,
          startDate: ws.start_date,
          candidateCount: candidates.length,
          mandatoryRequirements: sr.mandatory_requirements,
          preferredRequirements: sr.preferred_requirements,
          jobDescriptionText: ws.job_description_text ?? "",
        }}
      />
    </div>
  );
}
