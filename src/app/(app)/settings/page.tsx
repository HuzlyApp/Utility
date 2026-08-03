import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantById } from "@/lib/dal/tenants";
import { listCandidateStatuses } from "@/lib/dal/statuses";
import { TenantSettingsForm } from "@/components/workspace/tenant-settings-form";
import { StatusOptionsManager } from "@/components/workspace/status-options-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TENANT_ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }
  if (!user.tenantId) redirect("/dashboard");
  const tenant = await getTenantById(user.tenantId);
  if (!tenant) redirect("/dashboard");
  const statuses = await listCandidateStatuses(user, { includeInactive: true });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      <TenantSettingsForm tenantName={tenant.name} tenantSlug={tenant.slug} />
      <StatusOptionsManager initialStatuses={statuses} />
    </div>
  );
}
