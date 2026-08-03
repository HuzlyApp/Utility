import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RecruiterActivityDashboard } from "@/components/recruiter-activity/dashboard";

export const dynamic = "force-dynamic";

export default async function RecruiterActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.tenantId) redirect("/dashboard");
  if (user.role === "VIEWER") redirect("/dashboard");

  return (
    <RecruiterActivityDashboard
      isAdmin={user.role === "TENANT_ADMIN"}
      tenantId={user.tenantId}
    />
  );
}
