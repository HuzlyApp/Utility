"use client";

import { useState } from "react";
import { Button, TextInput } from "@/components/ui/primitives";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  user_count: number;
  workspace_count: number;
  candidate_count: number;
  analysis_count: number;
  created_at: string;
  last_activity_at: string | null;
}

export function TenantAdmin({ initial }: { initial: TenantRow[] }) {
  const [rows, setRows] = useState<TenantRow[]>(initial);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    tenant_name: "",
    tenant_slug: "",
    tenant_admin_full_name: "",
    tenant_admin_email: "",
    temporary_password: "",
    account_status: "ACTIVE" as "ACTIVE" | "SUSPENDED",
  });

  async function refresh() {
    const res = await fetch("/api/superadmin/tenants");
    const data = await res.json();
    if (res.ok && data.success) setRows(data.tenants as TenantRow[]);
  }

  async function createTenant() {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage(data.error ?? "Could not create tenant.");
        return;
      }
      setMessage(
        `Workspace created successfully. Tenant: ${data.tenant.name}. Login: ${data.credentials_once.login}. Temporary password: ${data.credentials_once.temporary_password}`
      );
      setForm({
        tenant_name: "",
        tenant_slug: "",
        tenant_admin_full_name: "",
        tenant_admin_email: "",
        temporary_password: "",
        account_status: "ACTIVE",
      });
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    const res = await fetch(`/api/superadmin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Create Workspace</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <TextInput
            placeholder="Tenant name"
            value={form.tenant_name}
            onChange={(e) => setForm((f) => ({ ...f, tenant_name: e.target.value }))}
          />
          <TextInput
            placeholder="Tenant slug"
            value={form.tenant_slug}
            onChange={(e) => setForm((f) => ({ ...f, tenant_slug: e.target.value }))}
          />
          <TextInput
            placeholder="Tenant admin full name"
            value={form.tenant_admin_full_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, tenant_admin_full_name: e.target.value }))
            }
          />
          <TextInput
            placeholder="Tenant admin email"
            value={form.tenant_admin_email}
            onChange={(e) =>
              setForm((f) => ({ ...f, tenant_admin_email: e.target.value }))
            }
          />
          <TextInput
            placeholder="Temporary password"
            type="password"
            value={form.temporary_password}
            onChange={(e) =>
              setForm((f) => ({ ...f, temporary_password: e.target.value }))
            }
          />
          <select
            value={form.account_status}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                account_status: e.target.value as "ACTIVE" | "SUSPENDED",
              }))
            }
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={createTenant} disabled={creating}>
            {creating ? "Creating..." : "Create Workspace"}
          </Button>
          {message && <p className="text-xs text-slate-600">{message}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Tenant List</h2>
        <div className="mt-3 space-y-2">
          {rows.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setStatus(t.id, "ACTIVE")}>
                    Reactivate
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setStatus(t.id, "SUSPENDED")}>
                    Suspend
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setStatus(t.id, "ARCHIVED")}>
                    Archive
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Status: {t.status} · Users: {t.user_count} · Jobs: {t.workspace_count} · Candidates:{" "}
                {t.candidate_count} · Analyses: {t.analysis_count}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
