"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { DownloadIcon, RefreshIcon, ClipboardIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { buildReportHtml } from "@/lib/report";
import { MatchSummaryCard } from "./match-summary-card";
import { SubmissionReadinessBanner } from "./submission-readiness-banner";
import { MatchMetricGrid } from "./match-metric-grid";
import {
  QualificationTable,
  type VerificationState,
} from "./qualification-table";
import { StrengthsCard } from "./strengths-card";
import { RisksCard } from "./risks-card";
import { ScreeningQuestions } from "./screening-questions";
import { RecruiterDecisionPanel } from "./recruiter-decision-panel";
import { AlternativeFitCard } from "./alternative-fit-card";
import { DataQualityPanel } from "./data-quality-panel";
import type {
  AnalyzeResponse,
  JobInputState,
  CandidateInputState,
} from "@/lib/clientTypes";

export function MatchAssessment({
  data,
  jobInput,
  candidateInput,
  onReanalyze,
  onStartOver,
  reanalyzing,
}: {
  data: AnalyzeResponse;
  jobInput: JobInputState;
  candidateInput: CandidateInputState;
  onReanalyze: (extraVerified: string) => void;
  onStartOver: () => void;
  reanalyzing: boolean;
}) {
  const { toast } = useToast();
  const r = data.validated_result;
  const [verifications, setVerifications] = useState<VerificationState>({});
  const [answers, setAnswers] = useState<Record<number, string>>({});

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

  return (
    <div className="space-y-6">
      {/* 1. Overall recommendation */}
      <MatchSummaryCard result={r} mandatory={data.mandatory_summary} />

      {/* 2. Submission readiness */}
      <SubmissionReadinessBanner result={r} />

      {/* 3. Summary metrics */}
      <MatchMetricGrid result={r} mandatory={data.mandatory_summary} />

      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <div className="space-y-6">
          {/* Mandatory + preferred status */}
          <QualificationTable
            requirements={requirements}
            questions={r.screening_questions}
            verifications={verifications}
            onToggleVerified={toggleVerified}
            onNote={setNote}
          />

          {/* Strengths / risks */}
          <div className="grid gap-6 md:grid-cols-2">
            <StrengthsCard strengths={r.strengths} />
            <RisksCard risks={r.gaps_and_risks} />
          </div>

          {/* Screening questions */}
          <ScreeningQuestions
            questions={r.screening_questions}
            answers={answers}
            onAnswer={(p, a) => setAnswers((prev) => ({ ...prev, [p]: a }))}
          />

          {/* Alternative fit (conditional) */}
          <AlternativeFitCard result={r} />

          {/* Data quality (collapsed by default) */}
          <DataQualityPanel
            result={r}
            scoreAdjustments={data.score_adjustments}
          />
        </div>

        {/* Sticky recruiter decision panel on desktop */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <RecruiterDecisionPanel
            analysisId={data.analysis_id}
            aiRecommendedAction={r.candidate_match.recommended_action}
          />
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
          <Button variant="ghost" onClick={onStartOver}>
            <ClipboardIcon className="h-4 w-4" />
            Start New Analysis
          </Button>
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
