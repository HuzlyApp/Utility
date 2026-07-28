"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton({
  className,
  idleLabel = "Sign out",
  pendingLabel = "Signing out…",
}: {
  className?: string;
  idleLabel?: string;
  pendingLabel?: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/session/sign-out", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button onClick={signOut} disabled={signingOut} className={className}>
      {signingOut ? pendingLabel : idleLabel}
    </button>
  );
}
