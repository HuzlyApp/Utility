"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { JobSourceInput } from "./job-source-input";
import type { StructuredJobFields } from "@/lib/types";

const JOB_STATUSES = ["OPEN", "ON_HOLD", "FILLED", "CLOSED"] as const;

export interface CreateJobInitial {
  job_ref?: string;
  job_title?: string;
  msp_or_client?: string;
  specialty?: string;
  department?: string;
  location?: string;
  shift?: string;
  start_date?: string;
  job_status?: string;
  jd?: string;
  structured?: StructuredJobFields;
}

export function CreateJobForm({
  initial,
  workspaceId,
}: {
  initial?: CreateJobInitial;
  workspaceId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [jobRef, setJobRef] = useState(initial?.job_ref ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? "");
  const [msp, setMsp] = useState(initial?.msp_or_client ?? "");
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [shift, setShift] = useState(initial?.shift ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [jobStatus, setJobStatus] = useState(initial?.job_status ?? "OPEN");
  const [mandatory, setMandatory] = useState(initial?.structured?.mandatory_requirements ?? "");
  const [preferred, setPreferred] = useState(initial?.structured?.preferred_requirements ?? "");

  const [jd, setJd] = useState(initial?.jd ?? "");
  const [jdQuality, setJdQuality] = useState<string>("HIGH");

  async function save() {
    if (!jd.trim()) {
      toast("A job description is required.", "error");
      return;
    }
    setSaving(true);
    const structured: StructuredJobFields = {
      specialty: specialty || undefined,
      department: department || undefined,
      location: location || undefined,
      required_shift: shift || undefined,
      start_date: startDate || undefined,
      mandatory_requirements: mandatory || undefined,
      preferred_requirements: preferred || undefined,
    };
    const body = {
      job_ref: jobRef || undefined,
      job_title: jobTitle || undefined,
      msp_or_client: msp || undefined,
      specialty: specialty || undefined,
      department: department || undefined,
      location: location || undefined,
      shift: shift || undefined,
      start_date: startDate || undefined,
      job_status: jobStatus,
      job_description_text: jd,
      job_description_quality: jdQuality,
      structured_requirements: structured,
    };
    try {
      const url = workspaceId ? `/api/workspaces/${workspaceId}` : "/api/workspaces";
      const res = await fetch(url, {
        method: workspaceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not save the job.", "error");
        return;
      }
      toast(workspaceId ? "Job updated." : "Job workspace created.", "success");
      router.push(`/jobs/${workspaceId ?? data.id}#add-candidates`);
      router.refresh();
    } catch {
      toast("Could not save the job.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Job details" description="Identify the role and its key attributes." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Job ID">
            <TextInput value={jobRef} onChange={(e) => setJobRef(e.target.value)} placeholder="e.g. MSP-48213" />
          </Field>
          <Field label="Job title">
            <TextInput value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. ICU Registered Nurse" />
          </Field>
          <Field label="MSP or client">
            <TextInput value={msp} onChange={(e) => setMsp(e.target.value)} placeholder="e.g. AMN / Mercy Hospital" />
          </Field>
          <Field label="Specialty">
            <TextInput value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. ICU / ER / Med-Surg" />
          </Field>
          <Field label="Department">
            <TextInput value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <Field label="Location">
            <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" />
          </Field>
          <Field label="Shift">
            <TextInput value={shift} onChange={(e) => setShift(e.target.value)} placeholder="e.g. Nights 7p-7a" />
          </Field>
          <Field label="Start date">
            <TextInput value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="e.g. ASAP / 2026-08-01" />
          </Field>
          <Field label="Job status">
            <select
              value={jobStatus}
              onChange={(e) => setJobStatus(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Structured requirements"
          description="List the mandatory and preferred requirements. These are compared against every candidate."
        />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label="Mandatory requirements" hint="One per line. e.g. Active RN license; 2+ yrs ICU; BLS + ACLS">
            <TextArea rows={6} value={mandatory} onChange={(e) => setMandatory(e.target.value)} />
          </Field>
          <Field label="Preferred requirements" hint="One per line.">
            <TextArea rows={6} value={preferred} onChange={(e) => setPreferred(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Job description"
          description="Provide via document, image, or pasted text. The full text is saved and reused for every candidate."
        />
        <CardBody>
          <JobSourceInput
            value={jd}
            onChange={setJd}
            onMeta={(m) => setJdQuality(m.quality)}
          />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? "Saving…" : workspaceId ? "Save Job" : "Save Job and Add Candidates"}
        </Button>
      </div>
    </div>
  );
}
