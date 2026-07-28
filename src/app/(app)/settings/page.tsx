import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantById } from "@/lib/dal/tenants";
import { TenantSettingsForm } from "@/components/workspace/tenant-settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TENANT_ADMIN") redirect("/dashboard");
  if (!user.tenantId) redirect("/dashboard");
  const tenant = await getTenantById(user.tenantId);
  if (!tenant) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      <TenantSettingsForm tenantName={tenant.name} tenantSlug={tenant.slug} />
    </div>
  );
}
