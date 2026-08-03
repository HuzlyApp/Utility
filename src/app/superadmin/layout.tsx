import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/app/sign-out-button";
import { MobileNav } from "@/components/app/mobile-nav";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/superadmin", label: "Overview" },
  { href: "/superadmin/tenants", label: "Tenants" },
  { href: "/superadmin/recruiter-activity", label: "Recruiter Activity" },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">Super Admin</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                Platform control plane
              </p>
            </div>
            <nav className="ml-2 hidden items-center gap-4 text-sm md:flex">
              <Link
                href="/superadmin"
                className="shrink-0 text-brand-700 hover:underline"
              >
                Overview
              </Link>
              <Link
                href="/superadmin/tenants"
                className="shrink-0 text-brand-700 hover:underline"
              >
                Tenants
              </Link>
              <Link
                href="/superadmin/recruiter-activity"
                className="shrink-0 text-brand-700 hover:underline"
              >
                Recruiter Activity
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SignOutButton className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" />
            <MobileNav
              items={NAV_ITEMS}
              ariaLabel="Super admin navigation"
              breakpoint="md"
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
