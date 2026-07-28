import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listTenantUsers } from "@/lib/dal/users";
import { TenantUsersAdmin } from "@/components/workspace/tenant-users-admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TENANT_ADMIN") redirect("/dashboard");
  if (!user.tenantId) redirect("/dashboard");

  const users = await listTenantUsers(user.tenantId);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Users</h1>
      <TenantUsersAdmin initial={users} />
    </div>
  );
}
