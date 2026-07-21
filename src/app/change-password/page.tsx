import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">Change your password</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.mustChangePassword
              ? "For security, please choose a new password before continuing."
              : "Update the password for your Recruiter Toolkit account."}
          </p>
        </div>
        <ChangePasswordForm mustChange={user.mustChangePassword} email={user.email} />
      </div>
    </div>
  );
}
