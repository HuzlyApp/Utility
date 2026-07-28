import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TenantWorkspacePage({
  params,
}: {
  params: { tenantSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "SUPER_ADMIN") redirect("/superadmin");
  if (!user.tenantSlug) notFound();
  if (user.tenantSlug !== params.tenantSlug) notFound();
  redirect("/dashboard");
}
