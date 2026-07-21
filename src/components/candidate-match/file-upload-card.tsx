"use client";

import React, { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Tabs,
  TextArea,
} from "@/components/ui/primitives";
import {
  UploadIcon,
  FileIcon,
  XIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

type ExtractionState =
  | "waiting"
  | "extracting"
  | "ready"
  | "needs_review"
  | "failed";

const STATE_META: Record<
  ExtractionState,
  { label: string; tone: "slate" | "blue" | "green" | "amber" | "red" }
> = {
  waiting: { label: "Waiting", tone: "slate" },
  extracting: { label: "Extracting", tone: "blue" },
  ready: { label: "Ready", tone: "green" },
  needs_review: { label: "Needs Review", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface UploadedFileMeta {
  name: string;
  size: number;
  type: string;
}

export function FileUploadCard({
  kind,
  title,
  description,
  icon,
  dropText,
  pastePlaceholder,
  value,
  onChangeText,
  endpoint,
  responseKey,
}: {
  kind: "job" | "resume";
  title: string;
  description: string;
  icon?: React.ReactNode;
  dropText: string;
  pastePlaceholder: string;
  value: string;
  onChangeText: (text: string) => void;
  endpoint: string;
  responseKey: "job_text" | "resume_text";
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<ExtractionState>("waiting");
  const [meta, setMeta] = useState<UploadedFileMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);

  async function processFile(file: File) {
    setMeta({ name: file.name, size: file.size, type: file.type });
    setState("extracting");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setState("failed");
        setError(data.error ?? "Could not read the file.");
        toast(data.error ?? "File extraction failed.", "error");
        return;
      }
      const text: string = data[responseKey] ?? "";
      onChangeText(text);
      setCharCount(text.length);
      const quality = data.extraction_quality as string;
      setState(quality === "LOW" ? "needs_review" : "ready");
      toast(
        kind === "job" ? "Job description processed." : "Résumé processed.",
        "success"
      );
    } catch {
      setState("failed");
      setError("Could not upload the file. Please try again or paste the text.");
      toast("Upload failed.", "error");
    }
  }

  function clearFile() {
    setMeta(null);
    setState("waiting");
    setError(null);
    onChangeText("");
    setCharCount(0);
  }

  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} />
      <CardBody className="space-y-4">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as "upload" | "paste")}
          tabs={[
            { value: "upload", label: kind === "job" ? "Upload File" : "Upload Résumé" },
            { value: "paste", label: kind === "job" ? "Paste Text" : "Paste Résumé" },
          ]}
        />

        {tab === "upload" && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="sr-only"
              aria-label={`Upload ${title}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
                e.target.value = "";
              }}
            />
            {!meta ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) processFile(f);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
                  dragOver
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40"
                )}
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
                  <UploadIcon />
                </span>
                <p className="text-sm font-medium text-slate-700">{dropText}</p>
                <p className="mt-1 text-xs text-slate-400">
                  PDF, DOC, DOCX or TXT · up to 10 MB
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {meta.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatBytes(meta.size)}
                    </p>
                    <div className="mt-2">
                      <Badge tone={STATE_META[state].tone}>
                        {STATE_META[state].label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-none gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                      aria-label="Replace file"
                    >
                      <RefreshIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFile}
                      aria-label="Remove file"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {error && (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
                {state === "needs_review" && (
                  <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Very little text was extracted. Review the content or paste
                    it manually.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "paste" && (
          <div>
            <TextArea
              rows={12}
              value={value}
              onChange={(e) => {
                onChangeText(e.target.value);
                setCharCount(e.target.value.length);
                setState(e.target.value.trim() ? "ready" : "waiting");
              }}
              placeholder={pastePlaceholder}
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{charCount.toLocaleString()} characters</span>
              {value && (
                <button
                  onClick={clearFile}
                  className="font-medium text-slate-500 hover:text-slate-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
