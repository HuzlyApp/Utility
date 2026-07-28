import { notFound } from "next/navigation";
import { getTenantById } from "@/lib/dal/tenants";

export const dynamic = "force-dynamic";

export default async function SuperAdminTenantDetailPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const tenant = await getTenantById(params.tenantId);
  if (!tenant) notFound();

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-slate-900">{tenant.name}</h1>
      <p className="text-sm text-slate-500">Slug: {tenant.slug}</p>
      <p className="text-sm text-slate-500">Status: {tenant.status}</p>
      <p className="text-sm text-slate-500">
        Created: {new Date(tenant.created_at).toLocaleString()}
      </p>
    </div>
  );
}
