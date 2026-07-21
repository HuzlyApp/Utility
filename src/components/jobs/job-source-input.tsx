"use client";

import React, { useRef, useState } from "react";
import { Badge, Button, TextArea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ACCEPT_ATTR } from "./upload-constants";

// Single-source input for a job description (or any single document): upload a
// document/image (extracted + editable) or paste text. Extracted text is always
// editable so low-confidence OCR can be reviewed before use (spec §5).
export function JobSourceInput({
  value,
  onChange,
  onMeta,
}: {
  value: string;
  onChange: (text: string) => void;
  onMeta?: (meta: { quality: string; method: string; needsReview: boolean }) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState<{ quality: string; needsReview: boolean; name: string } | null>(
    null
  );

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not read that file.", "error");
        return;
      }
      onChange(data.text ?? "");
      onMeta?.({
        quality: data.extraction_quality,
        method: data.extraction_method,
        needsReview: data.needs_review,
      });
      setMeta({ quality: data.extraction_quality, needsReview: data.needs_review, name: file.name });
      if (data.needs_review) {
        toast("Low extraction confidence — please review the text.", "info");
      } else {
        toast("Job description extracted.", "success");
      }
    } catch {
      toast("Could not read that file.", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "upload" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Upload file or image
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "paste" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Paste text
        </button>
      </div>

      {mode === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center"
        >
          <p className="text-sm text-slate-600">
            Drag &amp; drop a PDF, DOC, DOCX, TXT, or image (JPG, PNG, WEBP)
          </p>
          <p className="mt-1 text-xs text-slate-400">Images are read with OCR.</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Reading…" : "Choose file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {meta && (
            <p className="mt-3 text-xs text-slate-500">
              {meta.name} ·{" "}
              <Badge tone={meta.needsReview ? "amber" : "green"}>
                {meta.needsReview ? "Needs Review" : `Quality: ${meta.quality}`}
              </Badge>
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-[13px] font-medium text-slate-700">
          Job description text {value ? "(editable)" : ""}
        </label>
        <TextArea
          rows={mode === "paste" ? 12 : 8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste the full job description here, or upload a file above to extract it."
        />
      </div>
    </div>
  );
}
