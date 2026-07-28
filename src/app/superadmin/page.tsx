import Link from "next/link";
import { listTenants } from "@/lib/dal/tenants";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const tenants = await listTenants();
  const active = tenants.filter((t) => t.status === "ACTIVE").length;
  const suspended = tenants.filter((t) => t.status === "SUSPENDED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Platform overview</h1>
        <p className="text-sm text-slate-500">Tenant activity and platform status.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat title="Total tenants" value={String(tenants.length)} />
        <Stat title="Active tenants" value={String(active)} />
        <Stat title="Suspended tenants" value={String(suspended)} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recent tenants</h2>
          <Link href="/superadmin/tenants" className="text-sm text-brand-700 hover:underline">
            Manage tenants
          </Link>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {tenants.slice(0, 8).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="font-medium text-slate-800">{t.name}</span>
              <span className="text-slate-500">{t.slug}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
