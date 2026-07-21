"use client";

import React from "react";
import { FileUploadCard } from "./file-upload-card";
import { VerifiedCandidateFields } from "./verified-candidate-fields";
import { UserIcon } from "@/components/ui/icons";
import type { CandidateInputState } from "@/lib/clientTypes";

export function CandidateInformationScreen({
  candidate,
  onChange,
}: {
  candidate: CandidateInputState;
  onChange: (c: CandidateInputState) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FileUploadCard
        kind="resume"
        title="Candidate Résumé"
        description="Upload the candidate résumé or paste its contents below."
        icon={<UserIcon className="h-5 w-5" />}
        dropText="Drop the candidate résumé here or click to browse"
        pastePlaceholder="Paste the candidate's résumé text here."
        value={candidate.resume_text}
        onChangeText={(text) => onChange({ ...candidate, resume_text: text })}
        endpoint="/api/candidate-match/extract-resume"
        responseKey="resume_text"
      />
      <VerifiedCandidateFields candidate={candidate} onChange={onChange} />
    </div>
  );
}
