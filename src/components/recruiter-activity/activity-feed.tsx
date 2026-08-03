"use client";

import React from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";

export interface FeedItemView {
  id: string;
  description: string;
  relativeTime: string;
  candidateId: string | null;
  jobId: string | null;
  actionType: string;
}

export interface FeedPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

function actionIcon(actionType: string): string {
  if (actionType.includes("NOTE")) return "N";
  if (actionType.includes("STATUS") || actionType.includes("QUALIFIED")) return "S";
  if (actionType.includes("ANALYSIS")) return "A";
  if (actionType.includes("JOB")) return "J";
  if (actionType.includes("LOGIN")) return "L";
  return "•";
}

export function ActivityFeed({
  items,
  loading,
  error,
  onRetry,
  pagination,
  onPageChange,
}: {
  items: FeedItemView[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  pagination?: FeedPagination | null;
  onPageChange?: (page: number) => void;
}) {
  const from =
    pagination && pagination.total > 0
      ? (pagination.page - 1) * pagination.limit + 1
      : 0;
  const to = pagination
    ? Math.min(pagination.page * pagination.limit, pagination.total)
    : 0;

  return (
    <Card>
      <CardHeader
        title="Recent recruiter activity"
        description="Human-readable feed of recruiter actions in the selected period."
      />
      <CardBody>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-sm text-rose-800">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 text-sm font-medium text-brand-700 hover:underline"
              >
                Retry
              </button>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">No recruiter activity found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try selecting a different date range or recruiter.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {actionIcon(item.actionType)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{item.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.relativeTime}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {item.candidateId && (
                        <Link
                          href={`/candidates/${item.candidateId}`}
                          className="text-brand-600 hover:underline"
                        >
                          View candidate
                        </Link>
                      )}
                      {item.jobId && (
                        <Link
                          href={`/jobs/${item.jobId}`}
                          className="text-brand-600 hover:underline"
                        >
                          View job
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {pagination && pagination.totalPages > 1 && onPageChange && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {from}–{to} of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!pagination.hasPrev || loading}
                    onClick={() => onPageChange(pagination.page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="min-w-[5.5rem] text-center text-xs font-medium text-slate-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!pagination.hasNext || loading}
                    onClick={() => onPageChange(pagination.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
