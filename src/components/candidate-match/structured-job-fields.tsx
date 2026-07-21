"use client";

import React, { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Field,
  TextInput,
} from "@/components/ui/primitives";
import { BriefcaseIcon, ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { JobInputState } from "@/lib/clientTypes";
import type { StructuredJobFields as SJF } from "@/lib/types";

const ADVANCED: { key: keyof SJF; label: string }[] = [
  { key: "required_charting_system", label: "Charting system" },
  { key: "required_patient_population", label: "Patient population" },
  { key: "required_hospital_size", label: "Hospital size" },
  { key: "required_trauma_level", label: "Trauma level" },
  { key: "weekend_availability", label: "Weekend requirements" },
  { key: "on_call_requirements", label: "On-call requirements" },
  { key: "start_date", label: "Start date" },
  { key: "contract_duration", label: "Contract duration" },
  { key: "travel_eligibility", label: "Travel eligibility" },
  { key: "local_candidate_eligibility", label: "Local eligibility" },
  { key: "education_requirements", label: "Education requirements" },
  { key: "program_accreditation_requirements", label: "Accreditation" },
  { key: "additional_submission_restrictions", label: "Submission restrictions" },
];

export function StructuredJobFields({
  job,
  onChange,
}: {
  job: JobInputState;
  onChange: (job: JobInputState) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const setTop = (patch: Partial<JobInputState>) =>
    onChange({ ...job, ...patch });
  const setS = (patch: Partial<SJF>) =>
    onChange({ ...job, structured: { ...job.structured, ...patch } });

  return (
    <Card>
      <CardHeader
        title="Job Details"
        description="Structured fields supplement the description; conflicts are flagged, not overwritten."
        icon={<BriefcaseIcon className="h-5 w-5" />}
      />
      <CardBody className="space-y-6">
        <Group title="Basic information">
          <Field label="Job ID">
            <TextInput
              value={job.job_id}
              onChange={(e) => setTop({ job_id: e.target.value })}
              placeholder="e.g. 48213"
            />
          </Field>
          <Field label="Job title">
            <TextInput
              value={job.job_title}
              onChange={(e) => setTop({ job_title: e.target.value })}
              placeholder="e.g. CT Technologist"
            />
          </Field>
          <Field label="MSP or client">
            <TextInput
              value={job.msp_name}
              onChange={(e) => setTop({ msp_name: e.target.value })}
              placeholder="e.g. AMN / Mercy Hospital"
            />
          </Field>
          <Field label="Specialty">
            <TextInput
              value={job.structured.specialty ?? ""}
              onChange={(e) => setS({ specialty: e.target.value })}
            />
          </Field>
          <Field label="Department">
            <TextInput
              value={job.structured.department ?? ""}
              onChange={(e) => setS({ department: e.target.value })}
            />
          </Field>
          <Field label="Location">
            <TextInput
              value={job.structured.location ?? ""}
              onChange={(e) => setS({ location: e.target.value })}
            />
          </Field>
        </Group>

        <Group title="Mandatory requirements">
          <Field label="Minimum experience">
            <TextInput
              value={job.structured.minimum_years_experience ?? ""}
              onChange={(e) =>
                setS({ minimum_years_experience: e.target.value })
              }
            />
          </Field>
          <Field label="Required licenses">
            <TextInput
              value={job.structured.required_licenses ?? ""}
              onChange={(e) => setS({ required_licenses: e.target.value })}
            />
          </Field>
          <Field label="Required certifications">
            <TextInput
              value={job.structured.required_certifications ?? ""}
              onChange={(e) => setS({ required_certifications: e.target.value })}
            />
          </Field>
          <Field label="Required equipment">
            <TextInput
              value={job.structured.required_equipment ?? ""}
              onChange={(e) => setS({ required_equipment: e.target.value })}
            />
          </Field>
          <Field label="Required work setting">
            <TextInput
              value={job.structured.required_work_setting ?? ""}
              onChange={(e) => setS({ required_work_setting: e.target.value })}
            />
          </Field>
          <Field label="Required shift">
            <TextInput
              value={job.structured.required_shift ?? ""}
              onChange={(e) => setS({ required_shift: e.target.value })}
            />
          </Field>
        </Group>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Advanced Requirements
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 transition-transform",
                showAdvanced && "rotate-180"
              )}
            />
          </button>
          {showAdvanced && (
            <div className="mt-4 grid animate-fade-in gap-4 sm:grid-cols-2">
              {ADVANCED.map((f) => (
                <Field key={f.key} label={f.label}>
                  <TextInput
                    value={job.structured[f.key] ?? ""}
                    onChange={(e) =>
                      setS({ [f.key]: e.target.value } as Partial<SJF>)
                    }
                  />
                </Field>
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
