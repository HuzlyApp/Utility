import { listTenants } from "@/lib/dal/tenants";
import { TenantAdmin } from "@/components/superadmin/tenant-admin";

export const dynamic = "force-dynamic";

export default async function SuperAdminTenantsPage() {
  const tenants = await listTenants();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Tenants</h1>
      <TenantAdmin initial={tenants} />
    </div>
  );
}
