"use client";

import { useState } from "react";
import { Button, Card, CardBody, CardHeader, TextInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

export function TenantSettingsForm({
  tenantName,
  tenantSlug,
}: {
  tenantName: string;
  tenantSlug: string;
}) {
  const [name, setName] = useState(tenantName);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not update tenant name.", "error");
        return;
      }
      toast("Tenant name updated.", "success");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="General Settings" description="Tenant display configuration." />
      <CardBody className="space-y-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Tenant slug</p>
          <p className="text-sm font-medium text-slate-700">{tenantSlug}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Tenant name</p>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving || !name.trim()}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardBody>
    </Card>
  );
}
