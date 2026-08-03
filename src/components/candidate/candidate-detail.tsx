"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { MatchScoreRing } from "@/components/candidate-match/match-score-ring";
import { SubmissionReadinessBanner } from "@/components/candidate-match/submission-readiness-banner";
import { QualificationTable, type VerificationState } from "@/components/candidate-match/qualification-table";
import { StrengthsCard } from "@/components/candidate-match/strengths-card";
import { RisksCard } from "@/components/candidate-match/risks-card";
import { ScreeningQuestions } from "@/components/candidate-match/screening-questions";
import { DataQualityPanel } from "@/components/candidate-match/data-quality-panel";
import { DISPLAY_CATEGORY, DISPLAY_ACTION, type MatchCategory } from "@/lib/types";
import type { AiResult } from "@/lib/schema";
import type { EntityFile, DashboardDisposition } from "@/lib/dal/types";
import { DASHBOARD_DISPOSITIONS, DISPOSITION_LABELS } from "@/lib/dal/types";
import type { VerifiedRecruiterInputs } from "@/lib/types";
import {
  AiModelSelector,
  ModelBadge,
  type ProviderAvailability,
} from "@/components/workspace/ai-model-selector";
import { useAiModelSelection } from "@/hooks/use-ai-model-selection";
import { AnalysisProgressBar, stageFromEvent } from "@/components/workspace/analysis-progress";
import {
  STAGE_PROGRESS,
  type AnalysisProgressStage,
} from "@/lib/analysis-stages";
import {
  analyzeCandidateWithDuplicateCheck,
  DuplicateConfirmationNeededError,
  AnalyzeRequestError,
} from "@/lib/client/analyze-with-duplicate-check";
import type { DuplicateConfirmationRequired } from "@/lib/duplicate-candidate/messages";
import { DuplicateWarningDialog } from "@/components/workspace/duplicate-warning-dialog";
import { notifyWorkspaceCandidatesChanged } from "@/lib/workspace-events";
import {
  UpdateResumeDialog,
  type ResumeUpdateProgress,
} from "@/components/candidate/update-resume-dialog";
import { updateResumeAndReanalyze, ResumeUpdateError } from "@/lib/client/update-resume";
import { CandidateStatusSelect, type StatusOption } from "@/components/candidate/candidate-status-select";
import { CandidateNotesPanel } from "@/components/candidate/candidate-notes-panel";
import { CandidateActivityPanel } from "@/components/candidate/candidate-activity-panel";
import {
  CandidateAssignmentSelect,
  type AssigneeOption,
} from "@/components/candidate/candidate-assignment-select";
import { formatTimestamp } from "@/lib/client/candidate-crm";
import type { CandidateNoteRow, CandidateActivityRow } from "@/lib/dal/types";
import type { CrmActorRole } from "@/lib/candidate-crm";
import { ConfirmModal } from "@/components/ui/confirm-modal";

interface CandidateProps {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  location: string | null;
  extracted_resume_text: string | null;
  ocr_confidence: number | null;
  extraction_quality: string | null;
  verified_information: VerifiedRecruiterInputs;
  current_status_id: string | null;
  status_name: string | null;
  status_color: string | null;
  assigned_recruiter_id: string | null;
  assigned_recruiter_name: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  last_status_changed_by_name: string | null;
  last_status_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AnalysisProps {
  id: string;
  validated_result: AiResult;
  score_adjustments: string[];
  created_at: string;
  resume_version?: number;
  ai_provider?: string | null;
  ai_model?: string | null;
  model_name?: string | null;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-slate-500";
}

export function CandidateDetail({
  candidate,
  workspaceId,
  jobTitle,
  files,
  analysis,
  savedAnswers,
  disposition,
  dispositionNotes,
  history,
  statuses,
  recruiters,
  notes: initialNotes,
  activity,
  currentUserId,
  currentUserRole,
}: {
  candidate: CandidateProps;
  workspaceId: string | null;
  jobTitle: string | null;
  files: EntityFile[];
  analysis: AnalysisProps | null;
  savedAnswers: { question: string; answer: string }[];
  disposition: string | null;
  dispositionNotes: string | null;
  history: {
    id: string;
    overall_match_score: number | null;
    match_category: string | null;
    created_at: string;
    ai_provider?: string | null;
    ai_model?: string | null;
    model_name?: string | null;
  }[];
  pipelineStatus?: string | null;
  statuses: StatusOption[];
  recruiters: AssigneeOption[];
  notes: CandidateNoteRow[];
  activity: CandidateActivityRow[];
  currentUserId: string;
  currentUserRole: CrmActorRole;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { optionId, setOptionId, option, requestBody } = useAiModelSelection();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [tab, setTab] = useState<"overview" | "activity">("overview");

  const [name, setName] = useState(candidate.full_name ?? "");
  const [email, setEmail] = useState(candidate.email ?? "");
  const [phone, setPhone] = useState(candidate.phone ?? "");
  const [specialty, setSpecialty] = useState(candidate.specialty ?? "");
  const [location, setLocation] = useState(candidate.location ?? "");
  const [resumeText, setResumeText] = useState(candidate.extracted_resume_text ?? "");
  const [verified, setVerified] = useState<VerifiedRecruiterInputs>(candidate.verified_information ?? {});
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<{
    stage: AnalysisProgressStage;
    percent: number;
    label: string;
  } | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateConfirmationRequired | null>(
    null
  );
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [updatingResume, setUpdatingResume] = useState(false);
  const [resumeUpdateProgress, setResumeUpdateProgress] =
    useState<ResumeUpdateProgress | null>(null);
  const [resumeUpdateError, setResumeUpdateError] = useState<string | null>(null);
  const [forceResumeRetry, setForceResumeRetry] = useState(false);
  const [nameMismatch, setNameMismatch] = useState<{
    detectedName: string;
    existingName: string;
  } | null>(null);
  const [nameDecision, setNameDecision] = useState<"keep" | "replace">("keep");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const duplicateResolverRef = React.useRef<((continued: boolean) => void) | null>(null);
  const resumeProgressTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reconcile local form state when the server props refresh after save/reanalyze.
  React.useEffect(() => {
    setName(candidate.full_name ?? "");
    setEmail(candidate.email ?? "");
    setPhone(candidate.phone ?? "");
    setSpecialty(candidate.specialty ?? "");
    setLocation(candidate.location ?? "");
    setResumeText(candidate.extracted_resume_text ?? "");
    setVerified(candidate.verified_information ?? {});
  }, [candidate]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/providers");
        const data = await res.json();
        if (!cancelled && res.ok && data.success) {
          setAvailability(data.availability as ProviderAvailability);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [verifications, setVerifications] = useState<VerificationState>({});
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    if (analysis) {
      analysis.validated_result.screening_questions.forEach((q) => {
        const saved = savedAnswers.find((s) => s.question === q.question);
        if (saved) map[q.priority] = saved.answer;
      });
    }
    return map;
  });

  const r = analysis?.validated_result ?? null;
  const requirements = useMemo(
    () => (r ? [...r.mandatory_requirements, ...r.preferred_requirements] : []),
    [r]
  );

  async function saveCandidate(patch: Record<string, unknown>, message: string) {
    setSavingCandidate(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      toast(message || "Candidate saved", "success");
      if (workspaceId) notifyWorkspaceCandidatesChanged(workspaceId);
      router.refresh();
    } catch {
      toast("Could not save changes.", "error");
    } finally {
      setSavingCandidate(false);
    }
  }

  async function reanalyze(duplicateConfirmation?: { token: string }) {
    if (!workspaceId) {
      toast("Attach this candidate to a job first.", "error");
      return;
    }
    if (availability && !availability[option.provider]?.available) {
      toast(
        availability[option.provider]?.message ??
          `${option.label} is unavailable.`,
        "error"
      );
      return;
    }
    setReanalyzing(true);
    setAnalysisStage({
      stage: "preparing",
      percent: STAGE_PROGRESS.preparing,
      label: "Preparing candidate data…",
    });
    try {
      await analyzeCandidateWithDuplicateCheck({
        workspaceId,
        candidateId: candidate.id,
        body: { ...requestBody, force_retry: true },
        duplicateConfirmation,
        onProgress: (event) => {
          const mapped = stageFromEvent(event);
          setAnalysisStage(mapped);
        },
      });
      setAnalysisStage({
        stage: "completed",
        percent: 100,
        label: "Analysis completed",
      });
      toast(`Assessment updated with ${option.label}.`, "success");
      notifyWorkspaceCandidatesChanged(workspaceId);
      router.refresh();
    } catch (err) {
      if (err instanceof DuplicateConfirmationNeededError && !duplicateConfirmation) {
        setAnalysisStage(null);
        setReanalyzing(false);
        const continued = await new Promise<boolean>((resolve) => {
          duplicateResolverRef.current = resolve;
          setDuplicateDialog(err.duplicate);
        });
        duplicateResolverRef.current = null;
        setDuplicateDialog(null);
        if (continued) {
          await reanalyze({ token: err.duplicate.duplicate_confirmation_token });
        }
        return;
      }
      const message =
        err instanceof AnalyzeRequestError ? err.message : "Analysis failed.";
      setAnalysisStage({
        stage: "failed",
        percent: 0,
        label: message,
      });
      toast(message, "error");
    } finally {
      setReanalyzing(false);
      setAnalysisStage((prev) => (prev?.stage === "completed" ? prev : null));
    }
  }

  function clearResumeProgressTimers() {
    for (const timer of resumeProgressTimersRef.current) clearTimeout(timer);
    resumeProgressTimersRef.current = [];
  }

  function startResumeProgressEstimate() {
    clearResumeProgressTimers();
    setResumeUpdateProgress({
      stage: "uploading",
      percent: 12,
      label: "Uploading resume…",
    });
    resumeProgressTimersRef.current.push(
      setTimeout(() => {
        setResumeUpdateProgress({
          stage: "extracting",
          percent: 30,
          label: "Extracting resume text…",
        });
      }, 1200),
      setTimeout(() => {
        setResumeUpdateProgress({
          stage: "analyzing",
          percent: 55,
          label: "Reanalyzing with AI…",
          indeterminate: true,
        });
      }, 3500),
      setTimeout(() => {
        setResumeUpdateProgress({
          stage: "saving",
          percent: 88,
          label: "Saving updated resume and analysis…",
        });
      }, 90_000)
    );
  }

  function resetResumeUpdateDialogState() {
    clearResumeProgressTimers();
    setUpdateDialogOpen(false);
    setResumeFile(null);
    setNameMismatch(null);
    setResumeUpdateProgress(null);
    setResumeUpdateError(null);
    setForceResumeRetry(false);
    setNameDecision("keep");
  }

  async function runResumeUpdate(continueMismatch = false) {
    if (!analysis?.id || !resumeFile) return;
    setUpdatingResume(true);
    setResumeUpdateError(null);
    startResumeProgressEstimate();
    try {
      await updateResumeAndReanalyze({
        analysisId: analysis.id,
        file: resumeFile,
        modelOptionId: optionId,
        continueNameMismatch: continueMismatch,
        candidateNameDecision: nameDecision,
        forceRetry: forceResumeRetry,
      });
      clearResumeProgressTimers();
      setForceResumeRetry(false);
      setResumeUpdateProgress({
        stage: "completed",
        percent: 100,
        label: "Resume updated and analysis completed",
      });
      toast("Resume updated and analysis rerun.", "success");
      if (workspaceId) notifyWorkspaceCandidatesChanged(workspaceId);
      // Brief success state so the user sees confirmation before the dialog closes.
      await new Promise((resolve) => setTimeout(resolve, 700));
      resetResumeUpdateDialogState();
      router.refresh();
    } catch (err) {
      clearResumeProgressTimers();
      if (
        err instanceof ResumeUpdateError &&
        err.code === "RESUME_NAME_MISMATCH" &&
        err.detectedName &&
        err.existingName
      ) {
        setNameMismatch({
          detectedName: err.detectedName,
          existingName: err.existingName,
        });
        setResumeUpdateProgress(null);
        setResumeUpdateError(null);
        toast("Name mismatch detected. Confirm to continue.", "error");
        return;
      }
      const message =
        err instanceof ResumeUpdateError ? err.message : "Could not update resume.";
      if (err instanceof ResumeUpdateError && err.code === "ALREADY_UPDATING") {
        setForceResumeRetry(true);
        setResumeUpdateProgress({
          stage: "failed",
          percent: 0,
          label: "Resume update failed",
        });
        setResumeUpdateError(`${message} Click Retry to force a new attempt.`);
        toast(message, "error");
        return;
      }
      setResumeUpdateProgress({
        stage: "failed",
        percent: 0,
        label: "Resume update failed",
      });
      setResumeUpdateError(message);
      toast(message, "error");
    } finally {
      setUpdatingResume(false);
    }
  }

  React.useEffect(() => {
    return () => clearResumeProgressTimers();
  }, []);

  function handleDuplicateContinue() {
    duplicateResolverRef.current?.(true);
  }

  function handleDuplicateCancel() {
    duplicateResolverRef.current?.(false);
  }

  async function saveAnswers() {
    if (!workspaceId || !r) return;
    const toSave = r.screening_questions.filter((q) => (answers[q.priority] ?? "").trim());
    try {
      for (const q of toSave) {
        await fetch(`/api/candidates/${candidate.id}/screening`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            question: q.question,
            answer: answers[q.priority],
            related_requirement: q.related_requirement,
            priority: q.priority,
            analysis_id: analysis?.id,
          }),
        });
      }
      toast("Screening answers saved.", "success");
    } catch {
      toast("Could not save answers.", "error");
    }
  }

  async function recordDisposition(d: DashboardDisposition, dispNotes: string) {
    if (!workspaceId) {
      toast("Attach this candidate to a job first.", "error");
      return;
    }
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/disposition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          disposition: d,
          notes: dispNotes,
          analysis_id: analysis?.id,
        }),
      });
      if (!res.ok) throw new Error();
      toast("Recruiter decision recorded.", "success");
      router.refresh();
    } catch {
      toast("Could not record decision.", "error");
    }
  }

  async function removeFromJob() {
    if (!workspaceId) return;
    setRemoveError(null);
    setRemoving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/candidates/${candidate.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setRemoveConfirmOpen(false);
      toast("Candidate removed from job successfully.", "success");
      router.push(`/jobs/${workspaceId}`);
      router.refresh();
    } catch {
      setRemoveError("Could not remove the candidate from this job. Please try again.");
      toast("Could not remove candidate.", "error");
    } finally {
      setRemoving(false);
    }
  }

  const cm = r?.candidate_match;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Candidate sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "overview"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === "activity"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
      </div>

      {tab === "activity" ? (
        <CandidateActivityPanel activity={activity} />
      ) : (
    <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
      {/* Main analysis column */}
      <div className="space-y-6">
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {cm ? (
              <MatchScoreRing
                score={cm.recommended_overall_match_score}
                label={DISPLAY_CATEGORY[cm.match_category as MatchCategory]}
                colorClass={scoreColor(cm.recommended_overall_match_score)}
              />
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-dashed border-slate-200 text-xs text-slate-400">
                Not analyzed
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900">
                {candidate.full_name || "Unnamed candidate"}
              </h1>
              <p className="text-sm text-slate-500">
                {jobTitle ? `For: ${jobTitle}` : "No job attached"}
              </p>
              <div className="mt-3 space-y-2">
                <CandidateStatusSelect
                  candidateId={candidate.id}
                  statuses={statuses}
                  value={candidate.current_status_id}
                  statusName={candidate.status_name}
                  statusColor={candidate.status_color}
                  updatedByName={candidate.last_status_changed_by_name}
                  updatedAt={candidate.last_status_changed_at}
                  onChanged={() => router.refresh()}
                />
                <p className="text-[11px] text-slate-500">
                  Candidate created by: {candidate.created_by_name || "—"}
                  {candidate.created_at ? ` · ${formatTimestamp(candidate.created_at)}` : ""}
                </p>
                {analysis && (
                  <p className="text-[11px] text-slate-500">
                    Analysis completed by: {candidate.updated_by_name || "—"}
                    {analysis.created_at ? ` · ${formatTimestamp(analysis.created_at)}` : ""}
                    {(analysis.ai_model || analysis.model_name) &&
                      ` · Model: ${analysis.ai_model ?? analysis.model_name}`}
                  </p>
                )}
                <p className="text-[11px] text-slate-500">
                  Last updated by: {candidate.updated_by_name || "—"}
                  {candidate.updated_at ? ` · ${formatTimestamp(candidate.updated_at)}` : ""}
                </p>
              </div>
              {cm && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{DISPLAY_CATEGORY[cm.match_category as MatchCategory]}</Badge>
                  <Badge tone="slate">Confidence {cm.confidence_score}%</Badge>
                  <Badge tone="slate">{DISPLAY_ACTION[cm.recommended_action]}</Badge>
                  {updatingResume && <Badge tone="amber">Updating resume</Badge>}
                  {analysis?.resume_version ? (
                    <Badge tone="slate">Version {analysis.resume_version}</Badge>
                  ) : null}
                  <ModelBadge
                    provider={analysis?.ai_provider}
                    model={analysis?.ai_model ?? analysis?.model_name}
                  />
                </div>
              )}
              {cm && (
                <p className="mt-2 text-sm text-slate-600">{cm.recruiter_decision_summary}</p>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <AiModelSelector
                value={optionId}
                onChange={setOptionId}
                disabled={reanalyzing}
                availability={availability}
              />
              <Button onClick={() => reanalyze()} disabled={reanalyzing || !workspaceId}>
                {reanalyzing
                  ? analysisStage?.label ?? option.loadingLabel
                  : analysis
                    ? "Reanalyze"
                    : "Analyze"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {reanalyzing && analysisStage && (
          <AnalysisProgressBar
            percent={analysisStage.percent}
            label={analysisStage.label}
            indeterminate={analysisStage.stage === "analyzing"}
            detail={
              analysisStage.stage === "failed"
                ? "Analysis failed — try again when ready."
                : undefined
            }
          />
        )}

        {r ? (
          <>
            <SubmissionReadinessBanner result={r} />
            <QualificationTable
              requirements={requirements}
              questions={r.screening_questions}
              verifications={verifications}
              onToggleVerified={(req) =>
                setVerifications((p) => ({
                  ...p,
                  [req]: { verified: !(p[req]?.verified ?? false), note: p[req]?.note ?? "" },
                }))
              }
              onNote={(req, note) =>
                setVerifications((p) => ({ ...p, [req]: { verified: p[req]?.verified ?? true, note } }))
              }
            />
            <div className="grid gap-6 md:grid-cols-2">
              <StrengthsCard strengths={r.strengths} />
              <RisksCard risks={r.gaps_and_risks} />
            </div>
            <div>
              <ScreeningQuestions
                questions={r.screening_questions}
                answers={answers}
                onAnswer={(p, a) => setAnswers((prev) => ({ ...prev, [p]: a }))}
              />
              {r.screening_questions.length > 0 && (
                <div className="mt-2 flex justify-end">
                  <Button variant="secondary" size="sm" onClick={saveAnswers}>
                    Save screening answers
                  </Button>
                </div>
              )}
            </div>
            <DataQualityPanel result={r} scoreAdjustments={analysis?.score_adjustments ?? []} />
          </>
        ) : (
          <Card>
            <CardBody className="py-10 text-center text-sm text-slate-500">
              This candidate has not been analyzed yet. Review the extracted text on the right, then
              run the analysis.
            </CardBody>
          </Card>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Candidate information" />
          <CardBody className="space-y-3">
            <Field label="Assigned recruiter">
              <CandidateAssignmentSelect
                candidateId={candidate.id}
                recruiters={recruiters}
                value={candidate.assigned_recruiter_id}
                onChanged={() => router.refresh()}
              />
            </Field>
            <Field label="Full name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Email">
                <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Phone">
                <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Specialty">
                <TextInput value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
              </Field>
              <Field label="Location">
                <TextInput value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
            </div>
            <Button
              size="sm"
              disabled={savingCandidate}
              onClick={() =>
                saveCandidate(
                  {
                    full_name: name,
                    email,
                    phone,
                    specialty,
                    location,
                  },
                  "Candidate saved"
                )
              }
            >
              {savingCandidate ? "Saving candidate…" : "Save details"}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Résumé files"
            description={
              candidate.ocr_confidence != null
                ? `OCR confidence ${candidate.ocr_confidence}%`
                : undefined
            }
          />
          <CardBody className="space-y-2">
            {files.length === 0 && <p className="text-sm text-slate-400">No files uploaded.</p>}
            {files.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Page {f.page_order + 1}</span>
                  <a
                    href={`/api/files/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium text-brand-700 hover:underline"
                  >
                    {f.file_name}
                  </a>
                  {f.needs_review && <Badge tone="amber">Needs Review</Badge>}
                </div>
                {f.is_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${f.id}`}
                    alt={f.file_name}
                    className="mt-2 max-h-40 w-full rounded border border-slate-100 object-contain"
                  />
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Extracted résumé text" description="Correct before analysis if needed." />
          <CardBody className="space-y-2">
            <TextArea rows={8} value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
            <Button
              size="sm"
              disabled={savingCandidate}
              onClick={() =>
                saveCandidate({ extracted_resume_text: resumeText }, "Candidate saved")
              }
            >
              {savingCandidate ? "Saving candidate…" : "Correct Extracted Text"}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Verified information" description="Stored as recruiter-confirmed evidence." />
          <CardBody className="space-y-2">
            <Field label="Licenses">
              <TextInput
                value={verified.license_information ?? ""}
                onChange={(e) => setVerified((v) => ({ ...v, license_information: e.target.value }))}
              />
            </Field>
            <Field label="Certifications">
              <TextInput
                value={verified.certification_information ?? ""}
                onChange={(e) => setVerified((v) => ({ ...v, certification_information: e.target.value }))}
              />
            </Field>
            <Field label="Availability / notes">
              <TextArea
                rows={3}
                value={verified.availability_notes ?? ""}
                onChange={(e) => setVerified((v) => ({ ...v, availability_notes: e.target.value }))}
              />
            </Field>
            <Button
              size="sm"
              disabled={savingCandidate}
              onClick={() => saveCandidate({ verified_information: verified }, "Verified information saved.")}
            >
              Add Verified Information
            </Button>
          </CardBody>
        </Card>

        <CandidateNotesPanel
          candidateId={candidate.id}
          initialNotes={initialNotes}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />

        <DispositionPanel
          current={disposition}
          currentNotes={dispositionNotes}
          aiAction={cm ? DISPLAY_ACTION[cm.recommended_action] : null}
          onRecord={recordDisposition}
        />

        {history.length > 0 && (
          <Card>
            <CardHeader title="Analysis history" />
            <CardBody className="space-y-1 text-sm">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <ModelBadge
                      provider={h.ai_provider}
                      model={h.ai_model ?? h.model_name}
                    />
                    {h.overall_match_score ?? "—"}% ·{" "}
                    {h.match_category
                      ? DISPLAY_CATEGORY[h.match_category as MatchCategory] ??
                        h.match_category
                      : ""}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {workspaceId && (
          <div className="flex flex-wrap gap-2">
            {analysis?.id && (
              <button
                onClick={() => {
                  setUpdateDialogOpen(true);
                  setNameMismatch(null);
                  setNameDecision("keep");
                  setResumeUpdateProgress(null);
                  setResumeUpdateError(null);
                  setForceResumeRetry(false);
                }}
                disabled={updatingResume || reanalyzing}
                className="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Update Resume
              </button>
            )}
            <a
              href={`/api/workspaces/${workspaceId}/report`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download Assessment
            </a>
            <button
              onClick={() => {
                setRemoveError(null);
                setRemoveConfirmOpen(true);
              }}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Remove from Job
            </button>
          </div>
        )}
      </div>

      {duplicateDialog && workspaceId && (
        <DuplicateWarningDialog
          candidateName={duplicateDialog.candidate_name}
          confidence={duplicateDialog.duplicate_confidence}
          matches={duplicateDialog.matches}
          workspaceId={workspaceId}
          onContinue={handleDuplicateContinue}
          onCancel={handleDuplicateCancel}
        />
      )}

      <UpdateResumeDialog
        candidateName={candidate.full_name || "candidate"}
        open={updateDialogOpen}
        pending={updatingResume}
        selectedFileName={resumeFile?.name ?? null}
        mismatch={nameMismatch}
        nameDecision={nameDecision}
        progress={resumeUpdateProgress}
        error={resumeUpdateError}
        onClose={resetResumeUpdateDialogState}
        onPickFile={(file) => {
          setResumeFile(file);
          setNameMismatch(null);
          setResumeUpdateProgress(null);
          setResumeUpdateError(null);
          setForceResumeRetry(false);
        }}
        onSubmit={() => runResumeUpdate(false)}
        onContinueMismatch={() => runResumeUpdate(true)}
        onNameDecision={setNameDecision}
      />

      <ConfirmModal
        isOpen={removeConfirmOpen}
        title="Remove candidate from job?"
        description="Remove this candidate from the selected job? The candidate record, uploaded files, notes, and analysis history will be kept."
        confirmLabel="Remove from Job"
        confirmLoadingLabel="Removing..."
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={removing}
        error={removeError}
        onCancel={() => {
          if (!removing) {
            setRemoveConfirmOpen(false);
            setRemoveError(null);
          }
        }}
        onConfirm={removeFromJob}
      />
    </div>
      )}
    </div>
  );
}

function DispositionPanel({
  current,
  currentNotes,
  aiAction,
  onRecord,
}: {
  current: string | null;
  currentNotes: string | null;
  aiAction: string | null;
  onRecord: (d: DashboardDisposition, notes: string) => void;
}) {
  const [selected, setSelected] = useState<DashboardDisposition | "">((current as DashboardDisposition) ?? "");
  const [notes, setNotes] = useState(currentNotes ?? "");

  return (
    <Card>
      <CardHeader
        title="Recruiter decision"
        description="Kept separate from the AI recommendation."
      />
      <CardBody className="space-y-2">
        {aiAction && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            AI recommendation: <span className="font-medium text-slate-700">{aiAction}</span>
          </p>
        )}
        <div className="space-y-1">
          {DASHBOARD_DISPOSITIONS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="disposition"
                checked={selected === d}
                onChange={() => setSelected(d)}
              />
              {DISPOSITION_LABELS[d]}
            </label>
          ))}
        </div>
        <TextArea
          rows={2}
          placeholder="Decision notes (optional)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button size="sm" disabled={!selected} onClick={() => selected && onRecord(selected, notes)}>
          Record decision
        </Button>
      </CardBody>
    </Card>
  );
}
