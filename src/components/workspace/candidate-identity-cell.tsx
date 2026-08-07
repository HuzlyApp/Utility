"use client";

import Link from "next/link";
import { displayOrDash } from "@/lib/candidate-crm";
import {
  getContactFieldUiState,
  isContactExtractionInFlight,
  normalizeContactExtractionStatus,
} from "@/lib/contact-extract";
import { displayCandidateName } from "@/lib/resume-name";
import { cn } from "@/lib/cn";

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : `tel:${phone.trim()}`;
}

const candidateLinkClass =
  "font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-sm";

function FieldLine({
  label,
  value,
  status,
  startedAt,
  attempts,
  canViewContact,
  href,
  candidateName,
  retrying,
  onRetry,
}: {
  label: string;
  value?: string | null;
  status?: string | null;
  startedAt?: string | null;
  attempts?: number | null;
  canViewContact: boolean;
  href?: string | null;
  candidateName: string;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const ui = getContactFieldUiState({
    value,
    extractionStatus: status,
    canViewContact,
    startedAt,
    attempts,
    field: label.toLowerCase().includes("email") ? "email" : "phone",
  });

  let body: React.ReactNode;
  if (ui.kind === "value" && href) {
    body = (
      <a
        href={href}
        className="text-brand-700 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {ui.label}
      </a>
    );
  } else if (ui.kind === "extracting" || retrying) {
    body = (
      <span className="inline-flex items-center gap-1 text-slate-600">
        <span
          className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-slate-300 border-t-brand-600"
          aria-hidden
        />
        {retrying ? "Extracting…" : ui.label}
      </span>
    );
  } else if (ui.kind === "retryable") {
    body = (
      <span className="inline-flex flex-wrap items-center gap-x-1 text-slate-600">
        <span>{ui.label}</span>
        <span aria-hidden>·</span>
        {ui.canRetry && onRetry ? (
          <button
            type="button"
            className="cursor-pointer font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={retrying}
            aria-label={`Retry contact extraction for ${candidateName}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry();
            }}
          >
            Retry
          </button>
        ) : (
          <span>Retry</span>
        )}
      </span>
    );
  } else {
    body = <span className="text-slate-600">{ui.label}</span>;
  }

  return (
    <div className="flex flex-wrap gap-x-1">
      <dt className="shrink-0">{label}:</dt>
      <dd className="min-w-0 break-words">{body}</dd>
    </div>
  );
}

export function CandidateIdentityCell({
  name,
  href,
  jobCode,
  phone,
  email,
  canViewContact = true,
  contactExtractionStatus,
  contactExtractionStartedAt,
  contactExtractionAttempts,
  canRetryExtraction = false,
  retrying = false,
  onRetryExtraction,
  disposition,
  progressLabel,
  className,
  nameClassName,
}: {
  name: string | null | undefined;
  href?: string;
  jobCode?: string | null;
  phone?: string | null;
  email?: string | null;
  canViewContact?: boolean;
  contactExtractionStatus?: string | null;
  contactExtractionStartedAt?: string | null;
  contactExtractionAttempts?: number | null;
  canRetryExtraction?: boolean;
  retrying?: boolean;
  onRetryExtraction?: () => void;
  disposition?: string | null;
  progressLabel?: string | null;
  className?: string;
  nameClassName?: string;
}) {
  const displayName = displayCandidateName(name);
  const status = normalizeContactExtractionStatus(contactExtractionStatus);
  const inFlight = isContactExtractionInFlight(
    status,
    contactExtractionStartedAt
  );
  const onRetry =
    canRetryExtraction && onRetryExtraction ? onRetryExtraction : undefined;

  return (
    <div className={cn("min-w-[14rem] max-w-[22rem]", className)}>
      {href ? (
        <Link
          href={href}
          aria-label={`View ${displayName} candidate details`}
          className={cn("block break-words", candidateLinkClass, nameClassName)}
        >
          {displayName}
        </Link>
      ) : (
        <p
          className={cn(
            "break-words font-medium text-slate-900",
            nameClassName
          )}
        >
          {displayName}
        </p>
      )}

      {disposition ? (
        <span className="mt-0.5 inline-block text-[10px] uppercase tracking-wide text-slate-400">
          {disposition.replace(/_/g, " ")}
        </span>
      ) : null}

      <dl className="mt-1 space-y-0.5 text-xs leading-snug text-slate-500">
        <div className="flex flex-wrap gap-x-1">
          <dt className="shrink-0">Job Code:</dt>
          <dd className="min-w-0 break-words text-slate-600">
            {displayOrDash(jobCode)}
          </dd>
        </div>
        <FieldLine
          label="Phone"
          value={phone}
          status={contactExtractionStatus}
          startedAt={contactExtractionStartedAt}
          attempts={contactExtractionAttempts}
          canViewContact={canViewContact}
          href={canViewContact && phone?.trim() ? telHref(phone.trim()) : null}
          candidateName={displayName}
          retrying={retrying && !phone?.trim() && inFlight}
          onRetry={onRetry}
        />
        <FieldLine
          label="Email"
          value={email}
          status={contactExtractionStatus}
          startedAt={contactExtractionStartedAt}
          attempts={contactExtractionAttempts}
          canViewContact={canViewContact}
          href={
            canViewContact && email?.trim() ? `mailto:${email.trim()}` : null
          }
          candidateName={displayName}
          retrying={retrying && !email?.trim() && inFlight}
          onRetry={onRetry}
        />
      </dl>

      {progressLabel ? (
        <p className="mt-1 break-words text-[11px] font-normal text-blue-700">
          {progressLabel}
        </p>
      ) : null}
    </div>
  );
}
