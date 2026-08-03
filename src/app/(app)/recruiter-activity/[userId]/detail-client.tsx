"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Badge, Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ActivityKpiCard } from "@/components/recruiter-activity/kpi-card";
import { DateRangeFilters } from "@/components/recruiter-activity/date-range-filters";
import { ActivityFeed, type FeedItemView } from "@/components/recruiter-activity/activity-feed";
import type { DatePreset } from "@/lib/recruiter-activity";
import { formatRelativeTime } from "@/lib/recruiter-activity";

export default function RecruiterActivityDetailPage() {
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [preset, setPreset] = useState<DatePreset>("last_7_days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    full_name: string | null;
    email: string | null;
    role: string;
    status: string;
    last_login_at: string | null;
  } | null>(null);
  const [metrics, setMetrics] = useState<{
    assignedCandidates: number;
    candidatesAdded: number;
    candidatesWorked: number;
    analysesCompleted: number;
    notesAdded: number;
    statusChanges: number;
    qualified: number;
    submitted: number;
    interviews: number;
    offers: number;
    hired: number;
    rejected: number;
    lastActivityAt: string | null;
  } | null>(null);
  const [timeline, setTimeline] = useState<FeedItemView[]>([]);

  useEffect(() => {
    if (preset === "custom" && (!customFrom || !customTo)) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ preset });
        if (preset === "custom") {
          q.set("from", customFrom);
          q.set("to", customTo);
        }
        if (tenantId) q.set("tenantId", tenantId);
        const res = await fetch(
          `/api/recruiter-activity/recruiters/${params.userId}?${q.toString()}`
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load recruiter detail");
        }
        if (cancelled) return;
        setProfile(json.profile);
        setMetrics(json.metrics);
        setTimeline(json.timeline ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.userId, preset, customFrom, customTo, tenantId]);

  const backHref = tenantId
    ? `/superadmin/recruiter-activity?tenantId=${tenantId}`
    : "/recruiter-activity";

  const detailKpis: Array<{
    key:
      | "candidatesAdded"
      | "candidatesWorked"
      | "analysesCompleted"
      | "notesAdded"
      | "statusChanges"
      | "qualified"
      | "submitted"
      | "interviews"
      | "offers"
      | "hired"
      | "rejected";
    label: string;
    tooltip: string;
  }> = [
    { key: "candidatesAdded", label: "Candidates added", tooltip: "Candidates created by this recruiter." },
    { key: "candidatesWorked", label: "Candidates reviewed", tooltip: "Unique candidates with meaningful actions." },
    { key: "analysesCompleted", label: "Analyses completed", tooltip: "Completed analyses." },
    { key: "notesAdded", label: "Notes added", tooltip: "Notes created." },
    { key: "statusChanges", label: "Status changes", tooltip: "Valid status transitions." },
    { key: "qualified", label: "Qualified", tooltip: "Qualified events." },
    { key: "submitted", label: "Submitted", tooltip: "Submission events." },
    { key: "interviews", label: "Interviews", tooltip: "Interview events." },
    { key: "offers", label: "Offers", tooltip: "Offer events." },
    { key: "hired", label: "Hired", tooltip: "Hire events." },
    { key: "rejected", label: "Rejected", tooltip: "Rejection events." },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={backHref} className="text-brand-600 hover:underline">
          Recruiter Activity
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">{profile?.full_name || profile?.email || "Recruiter"}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {profile?.full_name || profile?.email || "Recruiter"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Detailed productivity profile and activity timeline.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>

      <DateRangeFilters
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={setPreset}
        onCustomChange={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
        }}
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader title="Recruiter summary" />
        <CardBody>
          {loading && !profile ? (
            <div className="h-20 animate-pulse rounded bg-slate-100" />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{profile?.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-900">{profile?.role || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Account status</dt>
                <dd>
                  <Badge tone={profile?.status === "ACTIVE" ? "green" : "slate"}>
                    {profile?.status || "—"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Last login</dt>
                <dd className="font-medium text-slate-900">
                  {profile?.last_login_at
                    ? formatRelativeTime(profile.last_login_at)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Last activity</dt>
                <dd className="font-medium text-slate-900">
                  {metrics?.lastActivityAt
                    ? formatRelativeTime(metrics.lastActivityAt)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Assigned candidates</dt>
                <dd className="font-medium text-slate-900">
                  {metrics?.assignedCandidates ?? "—"}
                </dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {detailKpis.map((k) => (
          <ActivityKpiCard
            key={k.key}
            label={k.label}
            value={metrics?.[k.key] ?? null}
            changePercent={null}
            tooltip={k.tooltip}
            loading={loading && !metrics}
          />
        ))}
      </div>

      <ActivityFeed items={timeline} loading={loading && timeline.length === 0} />
    </div>
  );
}
