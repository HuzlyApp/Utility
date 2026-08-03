import { Suspense } from "react";
import RecruiterActivityDetailPage from "./detail-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
          <div className="h-40 animate-pulse rounded bg-slate-100" />
        </div>
      }
    >
      <RecruiterActivityDetailPage />
    </Suspense>
  );
}
