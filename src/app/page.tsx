"use client";

import React, { useRef, useState } from "react";
import { CandidateMatchHeader } from "@/components/candidate-match/candidate-match-header";
import {
  CandidateMatchStepper,
  WORKFLOW_STEPS,
} from "@/components/candidate-match/candidate-match-stepper";
import { JobRequirementsScreen } from "@/components/candidate-match/job-requirements-screen";
import { CandidateInformationScreen } from "@/components/candidate-match/candidate-information-screen";
import { StickyActionBar } from "@/components/candidate-match/sticky-action-bar";
import { AnalysisLoadingState } from "@/components/candidate-match/analysis-loading-state";
import { MatchAssessment } from "@/components/candidate-match/match-assessment";
import { Button, Card, CardBody } from "@/components/ui/primitives";
import { ScanIcon, AlertIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import type {
  AnalyzeResponse,
  JobInputState,
  CandidateInputState,
} from "@/lib/clientTypes";
import type { AnalyzeRequestBody } from "@/lib/types";

type Phase = "job" | "candidate" | "loading" | "result" | "error";

const emptyJob: JobInputState = {
  job_id: "",
  job_title: "",
  msp_name: "",
  job_description_text: "",
  structured: {},
};

const emptyCandidate: CandidateInputState = {
  resume_text: "",
  candidate_name: "",
  recruiter_notes: "",
  verified: {},
};

export default function Home() {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("job");
  const [job, setJob] = useState<JobInputState>(emptyJob);
  const [candidate, setCandidate] = useState<CandidateInputState>(emptyCandidate);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const inFlightRef = useRef(false);

  const jobReady = job.job_description_text.trim().length > 0;
  const candidateReady = candidate.resume_text.trim().length > 0;

  const activeIndex =
    phase === "job" ? 0 : phase === "candidate" ? 1 : 2;
  const completed = [
    jobReady,
    candidateReady && jobReady,
    phase === "result",
  ];

  function goToStep(index: number) {
    if (index === 0) setPhase("job");
    else if (index === 1 && jobReady) setPhase("candidate");
  }

  function buildBody(
    extraVerified?: string
  ): AnalyzeRequestBody & { idempotency_key?: string } {
    const verified = { ...candidate.verified };
    if (extraVerified && extraVerified.trim()) {
      verified.availability_notes = [
        verified.availability_notes,
        extraVerified.trim(),
      ]
        .filter(Boolean)
        .join("\n");
    }
    return {
      job_id: job.job_id || undefined,
      job_title: job.job_title || undefined,
      msp_name: job.msp_name || undefined,
      structured_job_fields: {
        ...job.structured,
        job_id: job.job_id || undefined,
        job_title: job.job_title || undefined,
        msp_name: job.msp_name || undefined,
      },
      job_description_text: job.job_description_text,
      resume_text: candidate.resume_text,
      verified_recruiter_inputs: {
        ...verified,
        candidate_name: candidate.candidate_name || undefined,
      },
      recruiter_notes: candidate.recruiter_notes || undefined,
      idempotency_key:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now()),
    };
  }

  async function analyze() {
    if (inFlightRef.current) return;
    if (!jobReady || !candidateReady) {
      toast("Add both a job description and a résumé first.", "error");
      return;
    }
    inFlightRef.current = true;
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/candidate-match/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "The analysis could not be completed.");
        setPhase("error");
        return;
      }
      setResult(data as AnalyzeResponse);
      setPhase("result");
      toast("Analysis completed.", "success");
    } catch {
      setError("The analysis could not be completed. Please try again.");
      setPhase("error");
    } finally {
      inFlightRef.current = false;
    }
  }

  async function reanalyze(extraVerified: string) {
    if (!result) return;
    setReanalyzing(true);
    try {
      const url = result.analysis_id
        ? `/api/candidate-match/${result.analysis_id}/reanalyze`
        : "/api/candidate-match/analyze";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(extraVerified)),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "The reanalysis could not be completed.", "error");
        return;
      }
      setResult(data as AnalyzeResponse);
      toast("Assessment updated.", "success");
    } catch {
      toast("The reanalysis could not be completed.", "error");
    } finally {
      setReanalyzing(false);
    }
  }

  function startOver() {
    setJob(emptyJob);
    setCandidate(emptyCandidate);
    setResult(null);
    setError(null);
    setPhase("job");
  }

  const showStepper = phase !== "loading";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <CandidateMatchHeader
        showNewAnalysis={phase === "result"}
        onNewAnalysis={startOver}
      />

      {showStepper && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <CandidateMatchStepper
            activeIndex={activeIndex}
            completed={completed}
            onStepClick={goToStep}
          />
        </div>
      )}

      <div className="mt-6">
        {phase === "job" && (
          <>
            <JobRequirementsScreen job={job} onChange={setJob} />
            <StickyActionBar
              primaryLabel="Continue"
              onPrimary={() => setPhase("candidate")}
              primaryDisabled={!jobReady}
              hint={
                !jobReady
                  ? "Upload or paste a job description to continue."
                  : undefined
              }
            />
          </>
        )}

        {phase === "candidate" && (
          <>
            <CandidateInformationScreen
              candidate={candidate}
              onChange={setCandidate}
            />
            <StickyActionBar
              onBack={() => setPhase("job")}
              primaryLabel="Analyze Candidate Match"
              primaryIcon={<ScanIcon className="h-4 w-4" />}
              onPrimary={analyze}
              primaryDisabled={!candidateReady}
              hint={
                !candidateReady
                  ? "Add a résumé to run the analysis."
                  : undefined
              }
            />
          </>
        )}

        {phase === "loading" && (
          <div className="py-10">
            <AnalysisLoadingState />
          </div>
        )}

        {phase === "result" && result && (
          <MatchAssessment
            data={result}
            jobInput={job}
            candidateInput={candidate}
            onReanalyze={reanalyze}
            onStartOver={startOver}
            reanalyzing={reanalyzing}
          />
        )}

        {phase === "error" && (
          <Card className="mx-auto max-w-md">
            <CardBody className="text-center">
              <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertIcon />
              </span>
              <p className="mb-4 text-sm text-slate-700">{error}</p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setPhase("candidate")}
                >
                  Back to inputs
                </Button>
                <Button onClick={analyze}>Retry analysis</Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-slate-400">
        {WORKFLOW_STEPS.length}-step recruiter workflow · Grok AI provides
        decision support; the recruiter makes the final decision.
      </p>
    </div>
  );
}
