"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/primitives";
import { MobileNav } from "@/components/app/mobile-nav";

const BASE_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/jobs/new", label: "New Job" },
];

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/jobs/new") return pathname.startsWith("/jobs/new");
  if (href === "/jobs") {
    return (
      pathname === "/jobs" ||
      (pathname.startsWith("/jobs/") && !pathname.startsWith("/jobs/new"))
    );
  }
  if (href === "/candidates") return pathname.startsWith("/candidates");
  if (href === "/recruiter-activity") return pathname.startsWith("/recruiter-activity");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({
  email,
  role,
  tenantName,
}: {
  email: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "RECRUITER" | "VIEWER";
  tenantName?: string | null;
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

  const nav = [
    ...BASE_NAV,
    ...(role === "TENANT_ADMIN" || role === "RECRUITER"
      ? [{ href: "/recruiter-activity", label: "Recruiter Activity" }]
      : []),
    ...(role === "TENANT_ADMIN" ? [{ href: "/users", label: "Users" }] : []),
    { href: "/settings", label: "Settings" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 shrink-0 items">
              <Image
                src="/brasshr-logo.png"
                alt="BrassHR logo"
                width={160}
                height={82}
                className="h-9 w-auto"
                priority
              />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-navy-600">BrassHR</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {tenantName ?? "HR simplified"}
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = isNavActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
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
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {(role === "TENANT_ADMIN" || role === "SUPER_ADMIN") && (
            <Badge tone="blue" className="hidden sm:inline-flex">
              {role === "SUPER_ADMIN" ? "Super Admin" : "Tenant Admin"}
            </Badge>
          )}
          <div className="hidden text-right leading-tight md:block">
            <p className="max-w-[14rem] truncate text-xs font-medium text-slate-700">{email}</p>
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
          <MobileNav
            items={nav}
            footer={
              <div className="space-y-1">
                <p className="truncate text-xs font-medium text-slate-700">{email}</p>
                <Link
                  href="/change-password"
                  className="block text-xs text-brand-600 hover:underline"
                >
                  Change password
                </Link>
              </div>
            }
          />
        </div>
      </div>
    </header>
  );
}
