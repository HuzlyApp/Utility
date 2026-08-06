import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenantById } from "@/lib/dal/tenants";
import { listCandidateStatuses } from "@/lib/dal/statuses";
import { TenantSettingsForm } from "@/components/workspace/tenant-settings-form";
import { StatusOptionsManager } from "@/components/workspace/status-options-manager";
import { ProfileNameForm } from "@/components/workspace/profile-name-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "ACTIVE") redirect("/dashboard");

  const isAdmin = user.role === "TENANT_ADMIN" || user.role === "SUPER_ADMIN";
  const tenant =
    user.tenantId && isAdmin ? await getTenantById(user.tenantId) : null;
  const statuses =
    isAdmin && user.tenantId
      ? await listCandidateStatuses(user, { includeInactive: true })
      : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Manage your profile
          {isAdmin ? " and workspace configuration" : ""}.
        </p>
      </div>

      <ProfileNameForm initialName={user.name} email={user.email} />

      {isAdmin && tenant ? (
        <>
          <TenantSettingsForm
            tenantName={tenant.name}
            tenantSlug={tenant.slug}
          />
          <StatusOptionsManager initialStatuses={statuses} />
        </>
      ) : null}
    </div>
  );
}
