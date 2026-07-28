"use client";

import React from "react";
import { Button } from "@/components/ui/primitives";

export function UpdateResumeDialog({
  candidateName,
  open,
  pending,
  selectedFileName,
  mismatch,
  nameDecision,
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
  onClose: () => void;
  onPickFile: (file: File | null) => void;
  onSubmit: () => void;
  onContinueMismatch: () => void;
  onNameDecision: (value: "keep" | "replace") => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Update resume for {candidateName}
          </h3>
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
                Upload a newer version of this candidate&apos;s resume. The current analysis will be rerun using the updated document.
              </p>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
              >
                Choose File
              </button>
              {selectedFileName && <p className="text-xs text-slate-500">Selected: {selectedFileName}</p>}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                The uploaded resume appears to belong to <strong>{mismatch.detectedName}</strong>, but this record is for{" "}
                <strong>{mismatch.existingName}</strong>.
              </p>
              <p className="text-sm text-slate-700">Do you still want to replace the resume and continue?</p>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="mb-2 font-medium text-slate-800">Name to keep on candidate record</p>
                <label className="mb-1 flex items-center gap-2 text-slate-700">
                  <input
                    type="radio"
                    checked={nameDecision === "keep"}
                    onChange={() => onNameDecision("keep")}
                  />
                  Keep existing candidate name
                </label>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="radio"
                    checked={nameDecision === "replace"}
                    onChange={() => onNameDecision("replace")}
                  />
                  Replace with detected name
                </label>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {!mismatch ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button size="sm" onClick={onSubmit} disabled={pending || !selectedFileName}>
                {pending ? "Uploading and reanalyzing..." : "Upload and Reanalyze"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
              >
                Choose Another File
              </Button>
              <Button size="sm" onClick={onContinueMismatch} disabled={pending}>
                Continue Anyway
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
