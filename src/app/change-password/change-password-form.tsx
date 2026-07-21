"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Field, TextInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function ChangePasswordForm({
  mustChange,
  email,
}: {
  mustChange: boolean;
  email: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/session/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Could not change password.");
        return;
      }
      toast("Password changed.", "success");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not change password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" autoComplete="username" value={email} readOnly />
          <Field label="Current password" htmlFor="current">
            <TextInput
              id="current"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field label="New password" hint="At least 8 characters." htmlFor="new">
            <TextInput
              id="new"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <TextInput
              id="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />
            Show passwords
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex gap-2">
            {!mustChange && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => router.push("/dashboard")}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Saving…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
