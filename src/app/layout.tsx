import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Candidate-to-Job Match Analyzer",
  description:
    "AI-assisted decision support for healthcare staffing recruiters. Compare a job description against a candidate résumé.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <ToastProvider>
          {/* Application shell top bar (brand + workspace). */}
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                  CM
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-900">
                    Recruiter Toolkit
                  </p>
                  <p className="text-xs text-slate-500">
                    Healthcare staffing operations
                  </p>
                </div>
              </div>
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline">
                Match Analyzer
              </span>
            </div>
          </header>
          <main>{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
