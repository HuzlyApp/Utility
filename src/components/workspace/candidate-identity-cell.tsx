"use client";

import Link from "next/link";
import { displayOrDash } from "@/lib/candidate-crm";
import {
  canRetryContactExtraction,
  displayContactValue,
  isContactExtractionInFlight,
  isContactExtractionStale,
  normalizeContactExtractionStatus,
} from "@/lib/contact-extract";
import { displayCandidateName } from "@/lib/resume-name";
import { cn } from "@/lib/cn";

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : `tel:${phone.trim()}`;
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
  const stale = isContactExtractionStale(status, contactExtractionStartedAt);
  const showRetry =
    canRetryExtraction &&
    canViewContact &&
    typeof onRetryExtraction === "function" &&
    canRetryContactExtraction({
      status: contactExtractionStatus,
      attempts: contactExtractionAttempts,
      startedAt: contactExtractionStartedAt,
    });

  const phoneValue = displayContactValue({
    value: phone,
    extractionStatus: contactExtractionStatus,
    canViewContact,
    startedAt: contactExtractionStartedAt,
  });
  const emailValue = displayContactValue({
    value: email,
    extractionStatus: contactExtractionStatus,
    canViewContact,
    startedAt: contactExtractionStartedAt,
  });
  const phoneLink =
    canViewContact && phone?.trim() ? telHref(phone.trim()) : null;
  const emailLink =
    canViewContact && email?.trim() ? `mailto:${email.trim()}` : null;

  return (
    <div className={cn("min-w-[14rem] max-w-[22rem]", className)}>
      {href ? (
        <Link
          href={href}
          className={cn(
            "block break-words font-semibold text-slate-900 hover:text-brand-700",
            nameClassName
          )}
        >
          {displayName}
        </Link>
      ) : (
        <p
          className={cn(
            "break-words font-semibold text-slate-900",
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
        {status === "failed" || stale ? (
          <div className="space-y-1">
            {(phone?.trim() || email?.trim()) && (
              <>
                <div className="flex flex-wrap gap-x-1">
                  <dt className="shrink-0">Phone:</dt>
                  <dd className="min-w-0 break-words text-slate-600">
                    {phoneLink ? (
                      <a
                        href={phoneLink}
                        className="text-brand-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {phone!.trim()}
                      </a>
                    ) : (
                      displayOrDash(phone)
                    )}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-1">
                  <dt className="shrink-0">Email:</dt>
                  <dd className="min-w-0 break-all text-slate-600">
                    {emailLink ? (
                      <a
                        href={emailLink}
                        className="text-brand-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {email!.trim()}
                      </a>
                    ) : (
                      displayOrDash(email)
                    )}
                  </dd>
                </div>
              </>
            )}
            <p className="text-slate-600">
              {stale
                ? "Contact extraction did not complete"
                : "Contact extraction failed"}
            </p>
            {showRetry ? (
              <button
                type="button"
                className="text-brand-700 hover:underline disabled:opacity-60"
                disabled={retrying}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRetryExtraction?.();
                }}
              >
                {retrying ? "Retrying…" : "Retry extraction"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-1">
              <dt className="shrink-0">Phone:</dt>
              <dd className="min-w-0 break-words">
                {phoneLink ? (
                  <a
                    href={phoneLink}
                    className="text-brand-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {phoneValue}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    {inFlight ? (
                      <span
                        className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-slate-300 border-t-brand-600"
                        aria-hidden
                      />
                    ) : null}
                    {phoneValue}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-1">
              <dt className="shrink-0">Email:</dt>
              <dd className="min-w-0 break-all">
                {emailLink ? (
                  <a
                    href={emailLink}
                    className="text-brand-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {emailValue}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    {inFlight ? (
                      <span
                        className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-slate-300 border-t-brand-600"
                        aria-hidden
                      />
                    ) : null}
                    {emailValue}
                  </span>
                )}
              </dd>
            </div>
          </>
        )}
      </dl>

      {progressLabel ? (
        <p className="mt-1 break-words text-[11px] font-normal text-blue-700">
          {progressLabel}
        </p>
      ) : null}
    </div>
  );
}
