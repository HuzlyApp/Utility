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
import {
  AnalysisProgressBar,
  useEstimatedAnalysisPercent,
} from "@/components/workspace/analysis-progress";

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
  recruiter_notes: string | null;
  verified_information: VerifiedRecruiterInputs;
}

interface AnalysisProps {
  id: string;
  validated_result: AiResult;
  score_adjustments: string[];
  created_at: string;
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
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { optionId, setOptionId, option, requestBody } = useAiModelSelection();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);

  const [name, setName] = useState(candidate.full_name ?? "");
  const [email, setEmail] = useState(candidate.email ?? "");
  const [phone, setPhone] = useState(candidate.phone ?? "");
  const [specialty, setSpecialty] = useState(candidate.specialty ?? "");
  const [location, setLocation] = useState(candidate.location ?? "");
  const [resumeText, setResumeText] = useState(candidate.extracted_resume_text ?? "");
  const [notes, setNotes] = useState(candidate.recruiter_notes ?? "");
  const [verified, setVerified] = useState<VerifiedRecruiterInputs>(candidate.verified_information ?? {});
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const estimatePercent = useEstimatedAnalysisPercent(reanalyzing);

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
      toast(message, "success");
      router.refresh();
    } catch {
      toast("Could not save changes.", "error");
    } finally {
      setSavingCandidate(false);
    }
  }

  async function reanalyze() {
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
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/candidates/${candidate.id}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Analysis failed.", "error");
        return;
      }
      toast(`Assessment updated with ${option.label}.`, "success");
      router.refresh();
    } catch {
      toast("Analysis failed.", "error");
    } finally {
      setReanalyzing(false);
    }
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
    if (!confirm("Remove this candidate from the job? Their record and files are kept.")) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/candidates/${candidate.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast("Candidate removed from job.", "success");
      router.push(`/jobs/${workspaceId}`);
      router.refresh();
    } catch {
      toast("Could not remove candidate.", "error");
    }
  }

  const cm = r?.candidate_match;

  return (
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
              {cm && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{DISPLAY_CATEGORY[cm.match_category as MatchCategory]}</Badge>
                  <Badge tone="slate">Confidence {cm.confidence_score}%</Badge>
                  <Badge tone="slate">{DISPLAY_ACTION[cm.recommended_action]}</Badge>
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
              <Button onClick={reanalyze} disabled={reanalyzing || !workspaceId}>
                {reanalyzing
                  ? `${option.loadingLabel.replace(/…$/, "")} ${estimatePercent}%`
                  : analysis
                    ? "Reanalyze"
                    : "Analyze"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {reanalyzing && (
          <AnalysisProgressBar
            percent={estimatePercent}
            label={option.loadingLabel}
            detail="Percentage is an estimate until the model finishes this candidate."
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
                  "Candidate details saved."
                )
              }
            >
              Save details
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
                saveCandidate({ extracted_resume_text: resumeText }, "Extracted text updated.")
              }
            >
              Correct Extracted Text
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

        <Card>
          <CardHeader title="Recruiter notes" />
          <CardBody className="space-y-2">
            <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button
              size="sm"
              variant="secondary"
              disabled={savingCandidate}
              onClick={() => saveCandidate({ recruiter_notes: notes }, "Notes saved.")}
            >
              Save notes
            </Button>
          </CardBody>
        </Card>

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
            <a
              href={`/api/workspaces/${workspaceId}/report`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download Assessment
            </a>
            <button
              onClick={removeFromJob}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Remove from Job
            </button>
          </div>
        )}
      </div>
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
