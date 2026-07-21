"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Field, TextInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Invalid email or password.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await fetch("/api/session/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail || email }),
      });
      const data = await res.json();
      toast(
        data.message ??
          "If an account exists for that email, a reset link has been sent.",
        "success"
      );
      setForgotOpen(false);
    } catch {
      toast("Could not start password reset.", "error");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <Card>
      <CardBody>
        {!forgotOpen ? (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <TextInput
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <TextInput
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
                className="text-sm text-brand-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitForgot} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Reset your password</h2>
              <p className="mt-1 text-xs text-slate-500">
                Enter your email and we&apos;ll send reset instructions if an account exists.
              </p>
            </div>
            <Field label="Email" htmlFor="forgot-email">
              <TextInput
                id="forgot-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@agency.com"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setForgotOpen(false)}
              >
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={forgotLoading}>
                {forgotLoading ? "Sending…" : "Send reset link"}
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
