"use client";

import React from "react";
import { Button, Card, CardBody, CardHeader, TextInput } from "@/components/ui/primitives";
import { CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import type { AiScreeningQuestion } from "@/lib/schema";

export function ScreeningQuestions({
  questions,
  answers,
  onAnswer,
}: {
  questions: AiScreeningQuestion[];
  answers: Record<number, string>;
  onAnswer: (priority: number, answer: string) => void;
}) {
  const { toast } = useToast();

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied.`, "success");
    } catch {
      toast("Could not copy to clipboard.", "error");
    }
  }

  const allText = questions
    .map(
      (q) =>
        `${q.priority}. ${q.question}\n   Why: ${q.reason}${
          q.related_requirement ? `\n   Related: ${q.related_requirement}` : ""
        }`
    )
    .join("\n\n");

  return (
    <Card>
      <CardHeader
        title="Recommended Screening Questions"
        description={`${questions.length} targeted question${
          questions.length === 1 ? "" : "s"
        } to confirm before submission.`}
        action={
          questions.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copy(allText, "All questions")}
            >
              <CopyIcon className="h-4 w-4" />
              Copy all
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-3">
        {questions.length === 0 && (
          <p className="text-sm text-slate-400">
            No screening questions were generated.
          </p>
        )}
        {questions.map((q) => (
          <div
            key={q.priority}
            className="rounded-lg border border-slate-200 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {q.priority}
                </span>
                <p className="text-sm font-medium text-slate-800">
                  {q.question}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(q.question, "Question")}
                aria-label="Copy question"
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
            {q.reason && (
              <p className="mt-1.5 pl-9 text-xs text-slate-500">
                <span className="font-medium">Why this matters: </span>
                {q.reason}
              </p>
            )}
            {q.related_requirement && (
              <p className="pl-9 text-xs text-slate-400">
                Related: {q.related_requirement}
              </p>
            )}
            <div className="mt-2 pl-9">
              <TextInput
                placeholder="Record the candidate's answer…"
                value={answers[q.priority] ?? ""}
                onChange={(e) => onAnswer(q.priority, e.target.value)}
                onBlur={(e) =>
                  e.target.value.trim() && toast("Answer saved.", "success")
                }
              />
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
