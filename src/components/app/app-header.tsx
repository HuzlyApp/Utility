"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/primitives";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs/new", label: "New Job" },
];

export function AppHeader({
  email,
  role,
}: {
  email: string;
  role: "ADMIN" | "RECRUITER";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/session/sign-out", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              RT
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">Recruiter Toolkit</p>
              <p className="text-xs text-slate-500">Candidate Match Dashboard</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {role === "ADMIN" && <Badge tone="blue">Admin</Badge>}
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-xs font-medium text-slate-700">{email}</p>
            <Link
              href="/change-password"
              className="text-xs text-brand-600 hover:underline"
            >
              Change password
            </Link>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
