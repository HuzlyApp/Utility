import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/dal/workspaces";
import { AddCandidates } from "@/components/workspace/add-candidates";
import { jobRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AddCandidatesPage({
  params,
}: {
  params: { jobId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ws = await getWorkspace(user, params.jobId);
  if (!ws) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-brand-600 hover:underline">
            Dashboard
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            href={jobRoutes.workspace(ws.id)}
            className="text-brand-600 hover:underline"
          >
            {ws.job_title || "Workspace"}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">Add candidates</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Add Candidates</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload resumes for {ws.job_title || "this job"}.
        </p>
      </div>
      <AddCandidates
        workspaceId={ws.id}
        jobTitle={ws.job_title}
        jobRef={ws.job_ref}
      />
    </div>
  );
}
