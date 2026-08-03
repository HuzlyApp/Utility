"use client";

import React from "react";
import { Button } from "@/components/ui/primitives";
import { AnalysisProgressBar } from "@/components/workspace/analysis-progress";

export type ResumeUpdateProgress = {
  stage: "uploading" | "extracting" | "analyzing" | "saving" | "completed" | "failed";
  percent: number;
  label: string;
  indeterminate?: boolean;
};

export function UpdateResumeDialog({
  candidateName,
  open,
  pending,
  selectedFileName,
  mismatch,
  nameDecision,
  progress,
  error,
  onClose,
  onPickFile,
  onSubmit,
  onContinueMismatch,
  onNameDecision,
}: {
  candidateName: string;
  open: boolean;
  pending: boolean;
  selectedFileName: string | null;
  mismatch: { detectedName: string; existingName: string } | null;
  nameDecision: "keep" | "replace";
  progress: ResumeUpdateProgress | null;
  error: string | null;
  onClose: () => void;
  onPickFile: (file: File | null) => void;
  onSubmit: () => void;
  onContinueMismatch: () => void;
  onNameDecision: (value: "keep" | "replace") => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  const isComplete = progress?.stage === "completed";
  const isFailed = progress?.stage === "failed" || Boolean(error);
  const canDismiss = !pending || isFailed;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        className="dialog-scroll max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Update resume for {candidateName}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Replacing the resume automatically saves the file and runs a new analysis. You do not need
            to click Analyze afterward.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            disabled={pending}
          />
          {!mismatch ? (
            <>
              <p className="text-sm text-slate-700">
                Upload a newer version of this candidate&apos;s resume. The current analysis will be
                rerun using the updated document.
              </p>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
              >
                Choose File
              </button>
              {selectedFileName && (
                <p className="text-xs text-slate-500">Selected: {selectedFileName}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                The uploaded resume appears to belong to <strong>{mismatch.detectedName}</strong>, but
                this record is for <strong>{mismatch.existingName}</strong>.
              </p>
              <p className="text-sm text-slate-700">
                Confirm to save this resume and automatically start reanalysis.
              </p>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="mb-2 font-medium text-slate-800">Name to keep on candidate record</p>
                <label className="mb-1 flex items-center gap-2 text-slate-700">
                  <input
                    type="radio"
                    name="resume-name-decision"
                    checked={nameDecision === "keep"}
                    onChange={() => onNameDecision("keep")}
                    disabled={pending}
                  />
                  Keep existing candidate name ({mismatch.existingName})
                </label>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="radio"
                    name="resume-name-decision"
                    checked={nameDecision === "replace"}
                    onChange={() => onNameDecision("replace")}
                    disabled={pending}
                  />
                  Replace with detected name ({mismatch.detectedName})
                </label>
              </div>
            </>
          )}

          {progress && pending && !isComplete && (
            <AnalysisProgressBar
              percent={progress.percent}
              label={progress.label}
              indeterminate={progress.indeterminate}
              detail="Please keep this window open until the update finishes."
            />
          )}

          {isComplete && (
            <div
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
              role="status"
            >
              <p className="font-medium">Resume updated and analysis completed.</p>
              <p className="mt-0.5 text-xs text-emerald-800/80">Refreshing candidate details…</p>
            </div>
          )}

          {error && !pending && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
              role="alert"
            >
              <p className="font-medium">Resume update failed</p>
              <p className="mt-0.5">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {!mismatch ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={!canDismiss}>
                {pending ? "Please wait…" : "Cancel"}
              </Button>
              <Button size="sm" onClick={onSubmit} disabled={pending || !selectedFileName || isComplete}>
                {pending
                  ? progress?.label ?? "Uploading and reanalyzing…"
                  : error
                    ? "Retry Upload and Reanalyze"
                    : "Upload and Reanalyze"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={!canDismiss}>
                {pending ? "Please wait…" : "Cancel"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={pending || isComplete}
              >
                Choose Another File
              </Button>
              <Button
                size="sm"
                onClick={onContinueMismatch}
                disabled={pending || isComplete}
              >
                {pending
                  ? progress?.label ?? "Saving and reanalyzing…"
                  : error
                    ? "Retry Continue Anyway"
                    : "Continue Anyway"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
