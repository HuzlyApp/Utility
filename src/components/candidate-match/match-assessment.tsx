"use client";

import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { DownloadIcon, RefreshIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { buildReportHtml } from "@/lib/report";
import {
  CandidateResultHeader,
  type CandidateNav,
} from "./candidate-result-header";
import { MatchSummaryCard } from "./match-summary-card";
import { SubmissionReadinessBanner } from "./submission-readiness-banner";
import { MatchMetricGrid } from "./match-metric-grid";
import { LimitedInfoCard } from "./limited-info-card";
import {
  QualificationTable,
  type VerificationState,
} from "./qualification-table";
import { StrengthsCard } from "./strengths-card";
import { RisksCard } from "./risks-card";
import { ScreeningQuestions } from "./screening-questions";
import { ScoreExplanationPanel } from "./score-explanation-panel";
import { RecruiterDecisionPanel } from "./recruiter-decision-panel";
import { AlternativeFitCard } from "./alternative-fit-card";
import { DataQualityPanel } from "./data-quality-panel";
import {
  CandidateRankingPanel,
  type RankedCandidate,
} from "./candidate-ranking-panel";
import type {
  AnalyzeResponse,
  JobInputState,
  CandidateInputState,
} from "@/lib/clientTypes";

export interface WorkspaceControls {
  candidates: RankedCandidate[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAddCandidate: () => void;
  onStartNew: () => void;
}

export function MatchAssessment({
  data,
  jobInput,
  candidateInput,
  onReanalyze,
  reanalyzing,
  workspace,
}: {
  data: AnalyzeResponse;
  jobInput: JobInputState;
  candidateInput: CandidateInputState;
  onReanalyze: (extraVerified: string) => void;
  reanalyzing: boolean;
  workspace: WorkspaceControls;
}) {
  const { toast } = useToast();
  const r = data.validated_result;
  const [verifications, setVerifications] = useState<VerificationState>({});
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const requirementsRef = useRef<HTMLDivElement>(null);
  const screeningRef = useRef<HTMLDivElement>(null);
  const decisionRef = useRef<HTMLDivElement>(null);

  const requirements = useMemo(
    () => [...r.mandatory_requirements, ...r.preferred_requirements],
    [r.mandatory_requirements, r.preferred_requirements]
  );

  function toggleVerified(req: string) {
    setVerifications((prev) => ({
      ...prev,
      [req]: {
        verified: !(prev[req]?.verified ?? false),
        note: prev[req]?.note ?? "",
      },
    }));
  }
  function setNote(req: string, note: string) {
    setVerifications((prev) => ({
      ...prev,
      [req]: { verified: prev[req]?.verified ?? true, note },
    }));
  }

  const verifiedBlob = useMemo(() => {
    const lines: string[] = [];
    Object.entries(verifications).forEach(([req, v]) => {
      if (v.verified) {
        lines.push(`VERIFIED: ${req}${v.note ? ` — ${v.note}` : ""}`);
      }
    });
    r.screening_questions.forEach((q) => {
      const a = answers[q.priority];
      if (a && a.trim()) lines.push(`Q: ${q.question}\nA: ${a.trim()}`);
    });
    return lines.join("\n");
  }, [verifications, answers, r.screening_questions]);

  const verifiedCount = verifiedBlob.split("\n").filter(Boolean).length;

  function scrollTo(ref: React.RefObject<HTMLElement>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function downloadReport() {
    const html = buildReportHtml({ data, jobInput, candidateInput });
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      toast("Report opened for printing.", "success");
    } else {
      toast("Allow pop-ups to download the report.", "error");
    }
  }

  const nav: CandidateNav | undefined =
    workspace.candidates.length > 1
      ? {
          index: workspace.activeIndex,
          total: workspace.candidates.length,
          onPrev: () =>
            workspace.onSelect(
              (workspace.activeIndex - 1 + workspace.candidates.length) %
                workspace.candidates.length
            ),
          onNext: () =>
            workspace.onSelect(
              (workspace.activeIndex + 1) % workspace.candidates.length
            ),
        }
      : undefined;

  return (
    <div className="space-y-6">
      <CandidateResultHeader
        candidateName={candidateInput.candidate_name}
        jobTitle={jobInput.job_title || r.job.job_title}
        jobId={jobInput.job_id || r.job.job_id}
        mspName={jobInput.msp_name || r.job.msp_or_client}
        location={r.job.location}
        createdAt={data.created_at}
        onStartNew={workspace.onStartNew}
        onAddCandidate={workspace.onAddCandidate}
        nav={nav}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <div className="space-y-6">
          {/* 1. Overall recommendation */}
          <MatchSummaryCard
            result={r}
            mandatory={data.mandatory_summary}
            onStartScreening={() => scrollTo(screeningRef)}
            onAddVerified={() => scrollTo(requirementsRef)}
            onViewRequirements={() => scrollTo(requirementsRef)}
            onDownloadReport={downloadReport}
          />

          {/* 2. Submission readiness */}
          <SubmissionReadinessBanner result={r} />

          {/* 3. Data-quality note (neutral) */}
          <LimitedInfoCard result={r} />

          {/* 4. Summary metrics */}
          <MatchMetricGrid result={r} mandatory={data.mandatory_summary} />

          {/* 5. Mandatory + preferred status */}
          <div ref={requirementsRef}>
            <QualificationTable
              requirements={requirements}
              questions={r.screening_questions}
              verifications={verifications}
              onToggleVerified={toggleVerified}
              onNote={setNote}
            />
          </div>

          {/* 6. Strengths / verification needs */}
          <div className="grid gap-6 md:grid-cols-2">
            <StrengthsCard strengths={r.strengths} />
            <RisksCard risks={r.gaps_and_risks} />
          </div>

          {/* 7. Screening questions */}
          <div ref={screeningRef}>
            <ScreeningQuestions
              questions={r.screening_questions}
              answers={answers}
              onAnswer={(p, a) => setAnswers((prev) => ({ ...prev, [p]: a }))}
            />
          </div>

          {/* 8. Alternative fit (conditional) */}
          <AlternativeFitCard result={r} />

          {/* 9. Score explanation + data quality */}
          <ScoreExplanationPanel result={r} />
          <DataQualityPanel result={r} scoreAdjustments={data.score_adjustments} />
        </div>

        {/* Sticky sidebar: candidate list + recruiter decision */}
        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <CandidateRankingPanel
            candidates={workspace.candidates}
            activeIndex={workspace.activeIndex}
            onSelect={workspace.onSelect}
            onAddCandidate={workspace.onAddCandidate}
          />
          <div ref={decisionRef}>
            <RecruiterDecisionPanel
              analysisId={data.analysis_id}
              aiRecommendedAction={r.candidate_match.recommended_action}
            />
          </div>
        </div>
      </div>

      {/* Result actions */}
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          {verifiedCount > 0
            ? `${verifiedCount} verified item(s) / answer(s) ready to re-run.`
            : "Mark verified items or record answers, then re-run for an updated assessment."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadReport}>
            <DownloadIcon className="h-4 w-4" />
            Download Report
          </Button>
          <Button
            onClick={() => onReanalyze(verifiedBlob)}
            disabled={reanalyzing || verifiedCount === 0}
          >
            <RefreshIcon className="h-4 w-4" />
            {reanalyzing ? "Re-analyzing…" : "Re-run With Verified Info"}
          </Button>
        </div>
      </div>
    </div>
  );
}
