import { CreateJobForm } from "@/components/jobs/create-job-form";

export const dynamic = "force-dynamic";

export default function NewJobPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create Job Workspace</h1>
        <p className="mt-1 text-sm text-slate-500">
          Save one job description once — every candidate you add is compared against it.
        </p>
      </div>
      <CreateJobForm />
    </div>
  );
}
