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

const ADVANCED: { key: keyof SJF; label: string; suggestion: string }[] = [
  {
    key: "required_charting_system",
    label: "Charting system",
    suggestion: "e.g. Epic, Cerner, Meditech.",
  },
  {
    key: "required_patient_population",
    label: "Patient population",
    suggestion: "e.g. Adult, pediatric, neonatal.",
  },
  {
    key: "required_hospital_size",
    label: "Hospital size",
    suggestion: "e.g. 500+ beds, Magnet-designated.",
  },
  {
    key: "required_trauma_level",
    label: "Trauma level",
    suggestion: "e.g. Level I, Level II.",
  },
  {
    key: "weekend_availability",
    label: "Weekend requirements",
    suggestion: "e.g. Every other weekend required.",
  },
  {
    key: "on_call_requirements",
    label: "On-call requirements",
    suggestion: "e.g. 1 call shift per week.",
  },
  {
    key: "start_date",
    label: "Start date",
    suggestion: "e.g. ASAP, or 2026-08-01.",
  },
  {
    key: "contract_duration",
    label: "Contract duration",
    suggestion: "e.g. 13 weeks, permanent.",
  },
  {
    key: "travel_eligibility",
    label: "Travel eligibility",
    suggestion: "e.g. Must live 50+ miles from facility.",
  },
  {
    key: "local_candidate_eligibility",
    label: "Local eligibility",
    suggestion: "e.g. Local candidates accepted / not accepted.",
  },
  {
    key: "education_requirements",
    label: "Education requirements",
    suggestion: "e.g. BSN required, ADN accepted.",
  },
  {
    key: "program_accreditation_requirements",
    label: "Accreditation",
    suggestion: "e.g. ACEN or CCNE-accredited program.",
  },
  {
    key: "additional_submission_restrictions",
    label: "Submission restrictions",
    suggestion: "e.g. No first-time travelers; 2 references required.",
  },
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
          <Field label="Job ID" suggestion="The MSP or client requisition number.">
            <TextInput
              value={job.job_id}
              onChange={(e) => setTop({ job_id: e.target.value })}
              placeholder="e.g. 48213"
            />
          </Field>
          <Field
            label="Job title"
            suggestion="Use the exact title from the posting."
          >
            <TextInput
              value={job.job_title}
              onChange={(e) => setTop({ job_title: e.target.value })}
              placeholder="e.g. CT Technologist"
            />
          </Field>
          <Field
            label="MSP or client"
            suggestion="The staffing vendor or facility, e.g. AMN, Aya, Mercy Health."
          >
            <TextInput
              value={job.msp_name}
              onChange={(e) => setTop({ msp_name: e.target.value })}
              placeholder="e.g. AMN / Mercy Hospital"
            />
          </Field>
          <Field label="Specialty" suggestion="e.g. CT, MRI, ICU, Med-Surg.">
            <TextInput
              value={job.structured.specialty ?? ""}
              onChange={(e) => setS({ specialty: e.target.value })}
            />
          </Field>
          <Field
            label="Department"
            suggestion="e.g. Radiology, Emergency, Quality."
          >
            <TextInput
              value={job.structured.department ?? ""}
              onChange={(e) => setS({ department: e.target.value })}
            />
          </Field>
          <Field label="Location" suggestion="City and state, e.g. Columbus, OH.">
            <TextInput
              value={job.structured.location ?? ""}
              onChange={(e) => setS({ location: e.target.value })}
            />
          </Field>
        </Group>

        <Group title="Mandatory requirements">
          <Field
            label="Minimum experience"
            suggestion="e.g. 2 years recent CT experience."
          >
            <TextInput
              value={job.structured.minimum_years_experience ?? ""}
              onChange={(e) =>
                setS({ minimum_years_experience: e.target.value })
              }
            />
          </Field>
          <Field
            label="Required licenses"
            suggestion="e.g. Active Ohio or Compact RN license."
          >
            <TextInput
              value={job.structured.required_licenses ?? ""}
              onChange={(e) => setS({ required_licenses: e.target.value })}
            />
          </Field>
          <Field
            label="Required certifications"
            suggestion="e.g. ARRT(CT), BLS, ACLS."
          >
            <TextInput
              value={job.structured.required_certifications ?? ""}
              onChange={(e) => setS({ required_certifications: e.target.value })}
            />
          </Field>
          <Field
            label="Required equipment"
            suggestion="e.g. Siemens SOMATOM Force."
          >
            <TextInput
              value={job.structured.required_equipment ?? ""}
              onChange={(e) => setS({ required_equipment: e.target.value })}
            />
          </Field>
          <Field
            label="Required work setting"
            suggestion="e.g. Level I trauma, 500+ bed hospital."
          >
            <TextInput
              value={job.structured.required_work_setting ?? ""}
              onChange={(e) => setS({ required_work_setting: e.target.value })}
            />
          </Field>
          <Field
            label="Required shift"
            suggestion="e.g. Nights, 3x12, weekends required."
          >
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
                <Field key={f.key} label={f.label} suggestion={f.suggestion}>
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
