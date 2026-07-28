"use client";

import { useState } from "react";
import { Button, Card, CardBody, CardHeader, TextInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

interface TenantUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: "TENANT_ADMIN" | "RECRUITER" | "VIEWER" | "SUPER_ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  must_change_password: boolean;
  last_login_at: string | null;
}

export function TenantUsersAdmin({ initial }: { initial: TenantUser[] }) {
  const [users, setUsers] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "RECRUITER" as "TENANT_ADMIN" | "RECRUITER" | "VIEWER",
    temporary_password: "",
  });
  const { toast } = useToast();
  const router = useRouter();

  async function refresh() {
    const res = await fetch("/api/workspace/users");
    const data = await res.json();
    if (res.ok && data.success) setUsers(data.users as TenantUser[]);
  }

  async function createUser() {
    setCreating(true);
    try {
      const res = await fetch("/api/workspace/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast(data.error ?? "Could not create user.", "error");
        return;
      }
      toast(
        `User created. Login: ${data.credentials_once.login}; Temporary password: ${data.credentials_once.temporary_password}`,
        "success"
      );
      setForm({
        full_name: "",
        email: "",
        role: "RECRUITER",
        temporary_password: "",
      });
      await refresh();
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
    await fetch(`/api/workspace/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Create tenant user" />
        <CardBody className="grid gap-2 md:grid-cols-2">
          <TextInput
            placeholder="Full name"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
          <TextInput
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <select
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                role: e.target.value as "TENANT_ADMIN" | "RECRUITER" | "VIEWER",
              }))
            }
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="TENANT_ADMIN">TENANT_ADMIN</option>
            <option value="RECRUITER">RECRUITER</option>
            <option value="VIEWER">VIEWER</option>
          </select>
          <TextInput
            type="password"
            placeholder="Temporary password"
            value={form.temporary_password}
            onChange={(e) =>
              setForm((f) => ({ ...f, temporary_password: e.target.value }))
            }
          />
          <div className="md:col-span-2">
            <Button onClick={createUser} disabled={creating}>
              {creating ? "Creating..." : "Create User"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tenant users" />
        <CardBody className="space-y-2">
          {users.map((u) => (
            <div key={u.user_id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">{u.full_name ?? "Unnamed user"}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                  <p className="text-xs text-slate-500">
                    {u.role} · {u.status} · Last login:{" "}
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setStatus(u.user_id, "ACTIVE")}>
                    Activate
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setStatus(u.user_id, "SUSPENDED")}>
                    Suspend
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
