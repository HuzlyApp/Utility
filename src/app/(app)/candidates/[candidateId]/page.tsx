import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getCandidateDetail,
  getJobCandidate,
  getPrimaryWorkspaceId,
} from "@/lib/dal/candidates";
import { getWorkspace } from "@/lib/dal/workspaces";
import { getAnalysis, listCandidateAnalyses } from "@/lib/dal/analyses";
import { listEntityFiles } from "@/lib/dal/fileStore";
import { listScreeningAnswers } from "@/lib/dal/screening";
import { getLatestDisposition } from "@/lib/dal/dispositions";
import { listCandidateStatuses } from "@/lib/dal/statuses";
import { listCandidateNotes } from "@/lib/dal/notes";
import { listCandidateActivity, getCandidateActivitySummary } from "@/lib/dal/activity";
import { listTenantUsers } from "@/lib/dal/users";
import { listAnalysisRequirements } from "@/lib/dal/requirements";
import { CandidateDetail } from "@/components/candidate/candidate-detail";
import type { VerificationState } from "@/components/candidate-match/qualification-table";

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
  if (!user.tenantId) redirect("/dashboard");

  const candidate = await getCandidateDetail(user, params.candidateId);
  if (!candidate) notFound();

  const workspaceId = searchParams.w ?? (await getPrimaryWorkspaceId(user, params.candidateId));
  const workspace = workspaceId ? await getWorkspace(user, workspaceId) : null;

  const jmc = workspaceId
    ? await getJobCandidate(user, workspaceId, params.candidateId)
    : null;
  const analysis = jmc?.latest_analysis_id
    ? await getAnalysis(user, jmc.latest_analysis_id)
    : null;

  const [files, screening, disposition, history, statuses, notes, activity, users, activitySummary, requirementRows] =
    await Promise.all([
      listEntityFiles(user, "candidate", params.candidateId),
      workspaceId
        ? listScreeningAnswers(user, params.candidateId, workspaceId)
        : Promise.resolve([]),
      workspaceId
        ? getLatestDisposition(user, workspaceId, params.candidateId)
        : Promise.resolve(null),
      listCandidateAnalyses(user, params.candidateId),
      listCandidateStatuses(user),
      listCandidateNotes(user, params.candidateId),
      listCandidateActivity(user, params.candidateId),
      listTenantUsers(user.tenantId),
      getCandidateActivitySummary(user, params.candidateId),
      analysis
        ? listAnalysisRequirements(user, analysis.id)
        : Promise.resolve([]),
    ]);

  const savedVerifications: VerificationState = {};
  for (const row of requirementRows) {
    if (!row.requirement_text) continue;
    savedVerifications[row.requirement_text] = {
      verified: Boolean(row.recruiter_verified),
      note: row.recruiter_verification_note ?? "",
      requirementId: row.id,
    };
  }

  const recruiters = users.filter(
    (u) => u.status === "ACTIVE" && u.role !== "SUPER_ADMIN"
  );

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
          verified_information: candidate.verified_information ?? {},
          current_status_id: candidate.current_status_id,
          status_name: candidate.status_name,
          status_color: candidate.status_color,
          assigned_recruiter_id: candidate.assigned_recruiter_id,
          assigned_recruiter_name: candidate.assigned_recruiter_name,
          created_by_name: candidate.created_by_name,
          updated_by_name: candidate.updated_by_name,
          last_status_changed_by_name: candidate.last_status_changed_by_name,
          last_status_changed_at: candidate.last_status_changed_at,
          created_at: candidate.created_at,
          updated_at: candidate.updated_at,
          activitySummary: {
            recruiterCount: activitySummary.recruiterCount,
            lastActivityAt: activitySummary.lastActivityAt,
            lastActivityByName: activitySummary.lastActivityByName,
          },
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
                resume_version: analysis.resume_version,
                ai_provider: analysis.ai_provider,
                ai_model: analysis.ai_model,
                model_name: analysis.model_name,
              }
            : null
        }
        savedAnswers={screening.map((s) => ({
          question: s.question,
          answer: s.answer ?? "",
        }))}
        savedVerifications={savedVerifications}
        disposition={disposition?.disposition ?? null}
        dispositionNotes={disposition?.notes ?? null}
        history={history}
        pipelineStatus={jmc?.status ?? null}
        statuses={statuses}
        recruiters={recruiters}
        notes={notes}
        activity={activity}
        currentUserId={user.id}
        currentUserRole={user.role}
      />
    </div>
  );
}
