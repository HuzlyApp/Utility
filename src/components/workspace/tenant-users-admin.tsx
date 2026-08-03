"use client";

import { useState } from "react";
import { Button, Card, CardBody, CardHeader, TextInput } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
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
  const [users, setUsers] = useState(initial.filter((u) => u.status !== "ARCHIVED"));
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<TenantUser | null>(null);
  const [suspendError, setSuspendError] = useState<string | null>(null);
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
    if (res.ok && data.success) {
      setUsers(
        (data.users as TenantUser[]).filter((u) => u.status !== "ARCHIVED")
      );
    }
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
    setBusyId(userId);
    setSuspendError(null);
    try {
      const res = await fetch(`/api/workspace/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const message = data.error ?? "Could not update user.";
        if (status === "SUSPENDED") setSuspendError(message);
        toast(message, "error");
        return;
      }
      toast(status === "ACTIVE" ? "User activated." : "User suspended.", "success");
      setSuspendTarget(null);
      await refresh();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/workspace/users/${deleteTarget.user_id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error ?? "Could not delete user.");
        toast(data.error ?? "Could not delete user.", "error");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id));
      setDeleteTarget(null);
      toast("User deleted successfully.", "success");
      router.refresh();
    } finally {
      setDeleting(false);
    }
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
            <Button onClick={createUser} disabled={creating || deleting}>
              {creating ? "Creating..." : "Create User"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tenant users" />
        <CardBody className="space-y-2">
          {users.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">No users yet.</p>
          )}
          {users.map((u) => {
            const busy = busyId === u.user_id || deleting;
            return (
              <div key={u.user_id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {u.full_name ?? "Unnamed user"}
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                    <p className="text-xs text-slate-500">
                      {u.role} · {u.status} · Last login:{" "}
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || u.status === "ACTIVE"}
                      onClick={() => void setStatus(u.user_id, "ACTIVE")}
                    >
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || u.status === "SUSPENDED"}
                      onClick={() => {
                        setSuspendError(null);
                        setSuspendTarget(u);
                      }}
                    >
                      Suspend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={busy}
                      aria-label={`Delete ${u.full_name ?? u.email ?? "user"}`}
                      title="Delete user"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(u);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <ConfirmModal
        isOpen={Boolean(suspendTarget)}
        title="Suspend user?"
        description={
          <>
            Suspend{" "}
            <span className="font-medium text-slate-800">
              {suspendTarget?.full_name ?? suspendTarget?.email ?? "this user"}
            </span>
            ? This user will no longer be able to sign in. Their previous candidate activity
            will remain visible. You can activate them again later.
          </>
        }
        confirmLabel="Suspend user"
        confirmLoadingLabel="Suspending…"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={busyId === suspendTarget?.user_id}
        error={suspendError}
        onCancel={() => {
          if (busyId) return;
          setSuspendTarget(null);
          setSuspendError(null);
        }}
        onConfirm={() => {
          if (suspendTarget) void setStatus(suspendTarget.user_id, "SUSPENDED");
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete user?"
        description={
          <>
            Are you sure you want to delete{" "}
            <span className="font-medium text-slate-800">
              {deleteTarget?.full_name ?? deleteTarget?.email ?? "this user"}
            </span>
            ? This permanently deletes their account and sign-in credentials. Candidate
            records stay, but this user is removed from assignments and auth. The email can
            be reused. This cannot be undone.
          </>
        }
        confirmLabel="Delete user"
        confirmLoadingLabel="Deleting…"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
