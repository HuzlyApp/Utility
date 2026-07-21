"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import { Button, Card, CardBody, CardHeader, TextArea } from "@/components/ui/primitives";
import { CheckIcon, SparklesIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import {
  RECRUITER_DISPOSITIONS,
  DISPLAY_DISPOSITION,
  DISPOSITIONS_REQUIRING_NOTE,
  DISPLAY_ACTION,
  type RecruiterDisposition,
  type RecommendedAction,
} from "@/lib/types";

export function RecruiterDecisionPanel({
  analysisId,
  aiRecommendedAction,
}: {
  analysisId: string | null;
  aiRecommendedAction: RecommendedAction;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<RecruiterDisposition | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<RecruiterDisposition | null>(null);

  const noteRequired = selected
    ? DISPOSITIONS_REQUIRING_NOTE.includes(selected)
    : false;

  async function save() {
    if (!selected) return;
    if (noteRequired && !note.trim()) {
      toast("A note is required for this decision.", "error");
      return;
    }
    setSaving(true);
    try {
      if (analysisId) {
        const res = await fetch(
          `/api/candidate-match/${analysisId}/disposition`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recruiter_disposition: selected,
              recruiter_notes: note,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast(data.error ?? "Could not save the decision.", "error");
          return;
        }
      }
      setSaved(selected);
      toast("Recruiter decision saved.", "success");
    } catch {
      toast("Could not save the decision.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Recruiter Decision"
        description="You control the final outcome. The AI recommendation is guidance only."
      />
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <SparklesIcon className="h-4 w-4 text-brand-600" />
          AI recommendation:{" "}
          <span className="font-semibold text-slate-800">
            {DISPLAY_ACTION[aiRecommendedAction]}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {RECRUITER_DISPOSITIONS.map((d) => (
            <button
              key={d}
              onClick={() => setSelected(d)}
              aria-pressed={selected === d}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition",
                selected === d
                  ? "border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500"
                  : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {DISPLAY_DISPOSITION[d]}
              {selected === d && <CheckIcon className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </div>

        {selected && (
          <div className="animate-fade-in space-y-2">
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                noteRequired
                  ? "A note is required for this decision…"
                  : "Optional note…"
              }
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Saved separately from the AI recommendation.
              </p>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save Decision"}
              </Button>
            </div>
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            <CheckIcon className="h-4 w-4" />
            Decision recorded: {DISPLAY_DISPOSITION[saved]}
          </div>
        )}

        <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
          The AI recommendation supports the review process. The recruiter
          remains responsible for the final decision.
        </p>
      </CardBody>
    </Card>
  );
}
