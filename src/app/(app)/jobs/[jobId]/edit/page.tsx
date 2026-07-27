import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/dal/workspaces";
import { CreateJobForm } from "@/components/jobs/create-job-form";
import { jobRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function EditJobPage({
  params,
}: {
  params: { jobId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ws = await getWorkspace(user, params.jobId);
  if (!ws) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Edit Job</h1>
        <Link
          href={jobRoutes.workspace(ws.id)}
          className="text-sm text-brand-600 hover:underline"
        >
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
