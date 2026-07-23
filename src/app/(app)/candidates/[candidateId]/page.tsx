import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getCandidate,
  getJobCandidate,
  getPrimaryWorkspaceId,
} from "@/lib/dal/candidates";
import { getWorkspace } from "@/lib/dal/workspaces";
import { getAnalysis, listCandidateAnalyses } from "@/lib/dal/analyses";
import { listEntityFiles } from "@/lib/dal/fileStore";
import { listScreeningAnswers } from "@/lib/dal/screening";
import { getLatestDisposition } from "@/lib/dal/dispositions";
import { CandidateDetail } from "@/components/candidate/candidate-detail";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: { candidateId: string };
  searchParams: { w?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const candidate = await getCandidate(user, params.candidateId);
  if (!candidate) notFound();

  const workspaceId = searchParams.w ?? (await getPrimaryWorkspaceId(user, params.candidateId));
  const workspace = workspaceId ? await getWorkspace(user, workspaceId) : null;

  const jmc = workspaceId
    ? await getJobCandidate(user, workspaceId, params.candidateId)
    : null;
  const analysis = jmc?.latest_analysis_id
    ? await getAnalysis(user, jmc.latest_analysis_id)
    : null;

  const [files, screening, disposition, history] = await Promise.all([
    listEntityFiles(user, "candidate", params.candidateId),
    workspaceId ? listScreeningAnswers(user, params.candidateId, workspaceId) : Promise.resolve([]),
    workspaceId ? getLatestDisposition(user, workspaceId, params.candidateId) : Promise.resolve(null),
    listCandidateAnalyses(user, params.candidateId),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="text-brand-600 hover:underline">
          Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        {workspace ? (
          <Link href={`/jobs/${workspace.id}`} className="text-brand-600 hover:underline">
            {workspace.job_title || "Workspace"}
          </Link>
        ) : (
          <span className="text-slate-500">Candidate</span>
        )}
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">{candidate.full_name || "Candidate"}</span>
      </div>

      <CandidateDetail
        candidate={{
          id: candidate.id,
          full_name: candidate.full_name,
          email: candidate.email,
          phone: candidate.phone,
          specialty: candidate.specialty,
          location: candidate.location,
          extracted_resume_text: candidate.extracted_resume_text,
          ocr_confidence: candidate.ocr_confidence,
          extraction_quality: candidate.extraction_quality,
          recruiter_notes: candidate.recruiter_notes,
          verified_information: candidate.verified_information ?? {},
        }}
        workspaceId={workspaceId}
        jobTitle={workspace?.job_title ?? null}
        files={files}
        analysis={
          analysis
            ? {
                id: analysis.id,
                validated_result: analysis.validated_result,
                score_adjustments: analysis.score_adjustments,
                created_at: analysis.created_at,
                ai_provider: analysis.ai_provider,
                ai_model: analysis.ai_model,
                model_name: analysis.model_name,
              }
            : null
        }
        savedAnswers={screening.map((s) => ({ question: s.question, answer: s.answer ?? "" }))}
        disposition={disposition?.disposition ?? null}
        dispositionNotes={disposition?.notes ?? null}
        history={history}
      />
    </div>
  );
}
