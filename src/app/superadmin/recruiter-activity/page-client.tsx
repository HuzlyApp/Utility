"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RecruiterActivityDashboard } from "@/components/recruiter-activity/dashboard";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

export default function SuperAdminRecruiterActivityClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedTenantId = searchParams.get("tenantId");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/superadmin/tenants");
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load tenants");
        }
        if (!cancelled) {
          setTenants(
            (json.tenants ?? []).map((t: { id: string; name: string; slug: string }) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tenants");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recruiter Activity</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cross-tenant recruiter productivity. Select a tenant to view activity.
        </p>
      </div>

      <Card>
        <CardHeader title="Tenant" description="Required for super admin queries." />
        <CardBody>
          {loading ? (
            <div className="h-10 animate-pulse rounded bg-slate-100" />
          ) : error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : (
            <select
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={selectedTenantId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  router.push("/superadmin/recruiter-activity");
                  return;
                }
                router.push(`/superadmin/recruiter-activity?tenantId=${id}`);
              }}
            >
              <option value="">Select a tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          )}
        </CardBody>
      </Card>

      {selectedTenantId ? (
        <RecruiterActivityDashboard
          isAdmin
          tenantId={selectedTenantId}
          detailBasePath={`/superadmin/recruiter-activity/recruiters`}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          Choose a tenant to load recruiter activity.
        </div>
      )}
    </div>
  );
}
