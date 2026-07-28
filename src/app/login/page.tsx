import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth/session";
import { getPostLoginRedirect } from "@/lib/auth/return-to";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { returnTo?: string };
}) {
  const user = await getCurrentUser();
  const returnTo = getPostLoginRedirect(searchParams.returnTo);
  if (user) {
    redirect(user.mustChangePassword ? "/change-password" : returnTo);
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 items-center">
            <Image
              src="/brasshr-logo.png"
              alt="BrassHR logo"
              width={160}
              height={82}
              className="h-10 w-auto"
              priority
            />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-navy-600">BrassHR</h1>
            <p className="text-sm text-slate-500">
              HR simplified.
            </p>
          </div>
        </div>
        <LoginForm returnTo={returnTo} />
        <p className="mt-6 text-center text-xs text-slate-400">
          AI-assisted decision support. A recruiter makes the final decision.
        </p>
      </div>
    </div>
  );
}
