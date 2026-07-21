"use client";

import React from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui/primitives";
import { ShieldIcon, UserIcon } from "@/components/ui/icons";
import type { CandidateInputState } from "@/lib/clientTypes";
import type { VerifiedRecruiterInputs as VRI } from "@/lib/types";

const VERIFIED: { key: keyof VRI; label: string; suggestion: string }[] = [
  {
    key: "license_information",
    label: "Active licenses",
    suggestion: "e.g. OH RN license #123456, active through 2027.",
  },
  {
    key: "certification_information",
    label: "Certifications",
    suggestion: "e.g. BLS (AHA) valid to 06/2027, ACLS current.",
  },
  {
    key: "equipment_experience",
    label: "Equipment experience",
    suggestion: "e.g. Confirmed Siemens SOMATOM Force experience.",
  },
  {
    key: "shift_availability",
    label: "Shift availability",
    suggestion: "e.g. Available for nights and weekends.",
  },
  {
    key: "start_date_availability",
    label: "Start-date availability",
    suggestion: "e.g. Can start within 2 weeks.",
  },
  {
    key: "travel_or_local_preference",
    label: "Travel / local preference",
    suggestion: "e.g. Open to travel; lives 60 miles from facility.",
  },
];

export function VerifiedCandidateFields({
  candidate,
  onChange,
}: {
  candidate: CandidateInputState;
  onChange: (c: CandidateInputState) => void;
}) {
  const setTop = (patch: Partial<CandidateInputState>) =>
    onChange({ ...candidate, ...patch });
  const setV = (patch: Partial<VRI>) =>
    onChange({ ...candidate, verified: { ...candidate.verified, ...patch } });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Candidate"
          description="Optional. The name is not used in scoring."
          icon={<UserIcon className="h-5 w-5" />}
        />
        <CardBody>
          <Field
            label="Candidate name"
            suggestion="For your reference only — never used in scoring."
          >
            <TextInput
              value={candidate.candidate_name}
              onChange={(e) => setTop({ candidate_name: e.target.value })}
              placeholder="Optional"
            />
          </Field>
        </CardBody>
      </Card>

      <Card className="border-emerald-200">
        <CardHeader
          title="Recruiter-Verified Information"
          description="Information entered here may be treated as confirmed candidate evidence."
          icon={<ShieldIcon className="h-5 w-5 text-emerald-600" />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {VERIFIED.map((f) => (
            <Field key={f.key} label={f.label} suggestion={f.suggestion}>
              <TextInput
                value={candidate.verified[f.key] ?? ""}
                onChange={(e) =>
                  setV({ [f.key]: e.target.value } as Partial<VRI>)
                }
              />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field
              label="Availability notes"
              suggestion="Anything you confirmed directly with the candidate."
            >
              <TextInput
                value={candidate.verified.availability_notes ?? ""}
                onChange={(e) => setV({ availability_notes: e.target.value })}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recruiter Notes"
          description="These notes provide context but do not automatically confirm a qualification."
        />
        <CardBody>
          <TextArea
            rows={4}
            value={candidate.recruiter_notes}
            onChange={(e) => setTop({ recruiter_notes: e.target.value })}
            placeholder="Anything else the analyst should be aware of…"
          />
          <p className="mt-1 text-xs text-slate-400">
            e.g. Candidate is relocating to Ohio; prefers day shift but flexible.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
