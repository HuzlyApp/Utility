"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge, Button, TextInput, TextArea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ALLOWED_EXTS, IMAGE_EXTS, ACCEPT_ATTR, extOf } from "@/components/jobs/upload-constants";
import { notifyWorkspaceCandidatesChanged } from "@/lib/workspace-events";

type SubStatus =
  | "QUEUED"
  | "UPLOADING"
  | "EXTRACTING"
  | "OCR_PROCESSING"
  | "READY"
  | "NEEDS_REVIEW"
  | "DUPLICATE"
  | "FAILED";

interface Submission {
  id: string;
  name: string;
  files: File[];
  pastedText?: string;
  status: SubStatus;
  message?: string;
}

const STATUS_TONE: Record<SubStatus, "slate" | "blue" | "amber" | "green" | "red"> = {
  QUEUED: "slate",
  UPLOADING: "blue",
  EXTRACTING: "blue",
  OCR_PROCESSING: "blue",
  READY: "green",
  NEEDS_REVIEW: "amber",
  DUPLICATE: "amber",
  FAILED: "red",
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

function niceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddCandidates({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const valid: Submission[] = [];
    for (const f of incoming) {
      const ext = extOf(f.name);
      if (!ALLOWED_EXTS.includes(ext)) {
        toast(`${f.name}: unsupported type.`, "error");
        continue;
      }
      valid.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), files: [f], status: "QUEUED" });
    }
    if (valid.length) setSubs((prev) => [...prev, ...valid]);
  }

  function combineSelected() {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (ids.length < 2) {
      toast("Select two or more files to combine into one candidate.", "info");
      return;
    }
    setSubs((prev) => {
      const chosen = prev.filter((s) => ids.includes(s.id) && s.files.length > 0);
      const rest = prev.filter((s) => !ids.includes(s.id));
      const mergedFiles = chosen.flatMap((s) => s.files);
      const merged: Submission = {
        id: uid(),
        name: chosen[0]?.name ?? "Candidate",
        files: mergedFiles,
        status: "QUEUED",
      };
      return [...rest, merged];
    });
    setSelected({});
    toast("Files combined into one candidate. Reorder pages as needed.", "success");
  }

  function movePage(subId: string, index: number, dir: -1 | 1) {
    setSubs((prev) =>
      prev.map((s) => {
        if (s.id !== subId) return s;
        const files = [...s.files];
        const j = index + dir;
        if (j < 0 || j >= files.length) return s;
        [files[index], files[j]] = [files[j], files[index]];
        return { ...s, files };
      })
    );
  }

  function removePage(subId: string, index: number) {
    setSubs((prev) =>
      prev
        .map((s) => (s.id === subId ? { ...s, files: s.files.filter((_, i) => i !== index) } : s))
        .filter((s) => s.files.length > 0 || s.pastedText)
    );
  }

  function removeSub(subId: string) {
    setSubs((prev) => prev.filter((s) => s.id !== subId));
  }

  function setName(subId: string, name: string) {
    setSubs((prev) => prev.map((s) => (s.id === subId ? { ...s, name } : s)));
  }

  function addPasted() {
    if (!pasteText.trim()) {
      toast("Paste some résumé text first.", "error");
      return;
    }
    setSubs((prev) => [
      ...prev,
      { id: uid(), name: pasteName || "Pasted candidate", files: [], pastedText: pasteText, status: "QUEUED" },
    ]);
    setPasteName("");
    setPasteText("");
    setPasteOpen(false);
  }

  async function uploadOne(sub: Submission): Promise<SubStatus> {
    const hasImages = sub.files.some((f) => IMAGE_EXTS.includes(extOf(f.name)));
    setSubs((prev) =>
      prev.map((s) =>
        s.id === sub.id
          ? {
              ...s,
              status: hasImages ? "OCR_PROCESSING" : "UPLOADING",
              message: hasImages ? "Extracting résumé content…" : "Uploading résumé…",
            }
          : s
      )
    );
    try {
      const fd = new FormData();
      fd.append("name", sub.name);
      if (sub.pastedText) fd.append("pasted_text", sub.pastedText);
      for (const f of sub.files) fd.append("files", f, f.name);

      // Move to extracting while the server creates the DB record + processes files.
      setSubs((prev) =>
        prev.map((s) =>
          s.id === sub.id
            ? { ...s, status: "EXTRACTING", message: "Saving candidate…" }
            : s
        )
      );

      const res = await fetch(`/api/workspaces/${workspaceId}/candidates`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubs((prev) =>
          prev.map((s) =>
            s.id === sub.id
              ? { ...s, status: "FAILED", message: data.error ?? "Upload failed." }
              : s
          )
        );
        return "FAILED";
      }
      const status = data.status as SubStatus;
      setSubs((prev) =>
        prev.map((s) =>
          s.id === sub.id
            ? { ...s, status, message: "Candidate saved" }
            : s
        )
      );
      // Persist immediately in ranking: refresh sibling table from the DB.
      notifyWorkspaceCandidatesChanged(workspaceId);
      return status;
    } catch {
      setSubs((prev) =>
        prev.map((s) =>
          s.id === sub.id ? { ...s, status: "FAILED", message: "Upload failed." } : s
        )
      );
      return "FAILED";
    }
  }

  async function uploadAll() {
    const pending = subs.filter((s) => s.status === "QUEUED" || s.status === "FAILED");
    if (pending.length === 0) {
      toast("Nothing to upload.", "info");
      return;
    }
    setUploading(true);
    let failed = 0;
    // Sequential so one failure never blocks the batch (spec §7).
    for (const sub of pending) {
      const result = await uploadOne(sub);
      if (result === "FAILED") failed += 1;
    }
    setUploading(false);
    // Drop successfully persisted candidates from the ephemeral queue.
    setSubs((prev) => prev.filter((s) => s.status === "QUEUED" || s.status === "FAILED"));
    notifyWorkspaceCandidatesChanged(workspaceId);
    router.refresh();
    if (failed === 0) toast("All candidates added.", "success");
    else
      toast(
        `${pending.length - failed} added, ${failed} failed.`,
        failed === pending.length ? "error" : "info"
      );
  }

  const names = subs.map((s) => s.name.trim().toLowerCase());

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Add Candidates</h2>
          <p className="text-sm text-slate-500">
            Upload multiple résumés or résumé images to compare against this job.
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center"
        >
          <p className="text-sm text-slate-600">Drag &amp; drop files, or</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              Select files
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPasteOpen((o) => !o)}>
              Paste résumé text
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            PDF, DOC, DOCX, TXT, JPG, PNG, WEBP. Multiple images can be combined into one candidate.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {pasteOpen && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <TextInput
              placeholder="Candidate name"
              value={pasteName}
              onChange={(e) => setPasteName(e.target.value)}
            />
            <TextArea
              rows={5}
              placeholder="Paste résumé text…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPasteOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={addPasted}>
                Add to queue
              </Button>
            </div>
          </div>
        )}

        {subs.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Upload queue · {subs.length} candidate{subs.length === 1 ? "" : "s"}
              </p>
              <Button variant="ghost" size="sm" onClick={combineSelected}>
                Combine selected into one candidate
              </Button>
            </div>

            <div className="space-y-2">
              {subs.map((s) => {
                const isDup = names.filter((n) => n === s.name.trim().toLowerCase()).length > 1;
                return (
                  <div key={s.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      {s.files.length > 0 && (
                        <input
                          type="checkbox"
                          checked={!!selected[s.id]}
                          onChange={(e) => setSelected((p) => ({ ...p, [s.id]: e.target.checked }))}
                          aria-label="Select for combining"
                        />
                      )}
                      <TextInput
                        value={s.name}
                        onChange={(e) => setName(s.id, e.target.value)}
                        className="h-8 max-w-xs text-sm"
                      />
                      <Badge tone={STATUS_TONE[s.status]}>{s.status.replace(/_/g, " ")}</Badge>
                      {isDup && <Badge tone="amber">Possible duplicate</Badge>}
                      <button
                        onClick={() => removeSub(s.id)}
                        className="ml-auto text-xs text-slate-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>

                    {s.pastedText && (
                      <p className="mt-2 text-xs text-slate-400">Pasted text ({s.pastedText.length} chars)</p>
                    )}

                    {s.files.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {s.files.map((f, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600"
                          >
                            <span className="text-slate-400">Page {i + 1}</span>
                            <span className="truncate font-medium text-slate-700">{f.name}</span>
                            <span className="text-slate-400">
                              {extOf(f.name).toUpperCase()} · {niceSize(f.size)}
                              {IMAGE_EXTS.includes(extOf(f.name)) ? " · image" : ""}
                            </span>
                            {s.files.length > 1 && (
                              <span className="ml-auto flex gap-1">
                                <button onClick={() => movePage(s.id, i, -1)} className="px-1 hover:text-slate-900">
                                  ↑
                                </button>
                                <button onClick={() => movePage(s.id, i, 1)} className="px-1 hover:text-slate-900">
                                  ↓
                                </button>
                                <button
                                  onClick={() => removePage(s.id, i)}
                                  className="px-1 hover:text-red-600"
                                >
                                  ✕
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {s.message && <p className="mt-1 text-xs text-red-600">{s.message}</p>}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button onClick={uploadAll} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload & Add Candidates"}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
