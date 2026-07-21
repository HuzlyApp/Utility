import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/dal/workspaces";
import { listWorkspaceCandidates } from "@/lib/dal/candidates";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/primitives";
import { CreateJobForm } from "@/components/jobs/create-job-form";
import { AddCandidates } from "@/components/workspace/add-candidates";
import { RankingTable } from "@/components/workspace/ranking-table";
import { JobDescriptionPanel } from "@/components/workspace/job-description-panel";

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

  const ws = await getWorkspace(user, params.jobId);
  if (!ws) notFound();

  if (searchParams.edit) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Edit Job</h1>
          <Link href={`/jobs/${ws.id}`} className="text-sm text-brand-600 hover:underline">
            Back to workspace
          </Link>
        </div>
        <CreateJobForm
          workspaceId={ws.id}
          initial={{
            job_ref: ws.job_ref ?? "",
            job_title: ws.job_title ?? "",
            msp_or_client: ws.msp_or_client ?? "",
            specialty: ws.specialty ?? "",
            department: ws.department ?? "",
            location: ws.location ?? "",
            shift: ws.shift ?? "",
            start_date: ws.start_date ?? "",
            job_status: ws.job_status,
            jd: ws.job_description_text ?? "",
            structured: ws.structured_requirements ?? {},
          }}
        />
      </div>
    );
  }

  const candidates = await listWorkspaceCandidates(user, params.jobId);
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
            href={`/jobs/${ws.id}?edit=1`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit Job
          </Link>
          <a
            href={`/api/workspaces/${ws.id}/report`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Download Comparison Report
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        <div className="space-y-6">
          <div id="add-candidates">
            <AddCandidates workspaceId={ws.id} />
          </div>

          <Card>
            <CardHeader
              title="Candidate ranking"
              description="Sorted best-first. Analyze ready candidates, then compare and decide."
            />
            <CardBody>
              <RankingTable workspaceId={ws.id} initial={candidates} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Job summary" />
            <CardBody className="space-y-2 text-sm">
              <SummaryRow label="Specialty" value={sr.specialty || ws.specialty} />
              <SummaryRow label="Department" value={ws.department} />
              <SummaryRow label="Location" value={ws.location} />
              <SummaryRow label="Shift" value={ws.shift} />
              <SummaryRow label="Start date" value={ws.start_date} />
              <SummaryRow label="Candidates" value={String(candidates.length)} />
            </CardBody>
          </Card>

          {(sr.mandatory_requirements || sr.preferred_requirements) && (
            <Card>
              <CardHeader title="Saved requirements" />
              <CardBody className="space-y-3 text-sm">
                {sr.mandatory_requirements && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Mandatory</p>
                    <p className="whitespace-pre-line text-slate-700">{sr.mandatory_requirements}</p>
                  </div>
                )}
                {sr.preferred_requirements && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Preferred</p>
                    <p className="whitespace-pre-line text-slate-700">{sr.preferred_requirements}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <JobDescriptionPanel text={ws.job_description_text ?? ""} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-700">{value || "—"}</span>
    </div>
  );
}
