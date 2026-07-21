import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app/app-header";

// Server-side gate for every protected page (spec §1/§14). Redirects
// unauthenticated users to /login and first-login users to /change-password.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} role={user.role} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
