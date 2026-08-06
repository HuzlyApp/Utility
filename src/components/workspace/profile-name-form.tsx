"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  TextInput,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function ProfileNameForm({
  initialName,
  email,
}: {
  initialName: string | null;
  email: string;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Enter your name.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not update your name.", "error");
        return;
      }
      setName(data.full_name ?? trimmed);
      toast("Your name was updated.", "success");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your profile"
        description="Update how your name appears across the workspace."
      />
      <CardBody className="space-y-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Email</p>
          <p className="break-all text-sm font-medium text-slate-700">{email}</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Display name</span>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            maxLength={120}
            aria-label="Display name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
        </label>
        <Button
          onClick={() => void save()}
          disabled={saving || !name.trim() || name.trim() === (initialName ?? "").trim()}
        >
          {saving ? "Saving…" : "Save name"}
        </Button>
      </CardBody>
    </Card>
  );
}
