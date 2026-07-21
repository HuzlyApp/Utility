"use client";

import React from "react";
import { FileUploadCard } from "./file-upload-card";
import { StructuredJobFields } from "./structured-job-fields";
import { BriefcaseIcon } from "@/components/ui/icons";
import type { JobInputState } from "@/lib/clientTypes";

export function JobRequirementsScreen({
  job,
  onChange,
}: {
  job: JobInputState;
  onChange: (job: JobInputState) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FileUploadCard
        kind="job"
        title="Job Description"
        description="Upload the MSP job description or paste its contents below."
        icon={<BriefcaseIcon className="h-5 w-5" />}
        dropText="Drop the job description here or click to browse"
        pastePlaceholder="Paste the complete MSP, hospital, government, or healthcare-facility job description here."
        value={job.job_description_text}
        onChangeText={(text) =>
          onChange({ ...job, job_description_text: text })
        }
        endpoint="/api/candidate-match/extract-job"
        responseKey="job_text"
      />
      <StructuredJobFields job={job} onChange={onChange} />
    </div>
  );
}
