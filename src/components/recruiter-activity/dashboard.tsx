"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ActivityKpiCard } from "./kpi-card";
import { DateRangeFilters } from "./date-range-filters";
import {
  RecruiterProductivityTable,
  type ProductivityTableRow,
} from "./productivity-table";
import { ActivityFeed, type FeedItemView, type FeedPagination } from "./activity-feed";
import type { DatePreset } from "@/lib/recruiter-activity";
import { KPI_DEFINITIONS } from "@/lib/recruiter-activity";

const FEED_PAGE_SIZE = 20;

type KpiPayload = {
  value: number | null;
  previous: number | null;
  changePercent: number | null;
};

interface DashboardProps {
  isAdmin: boolean;
  tenantId?: string | null;
  detailBasePath?: string;
  exportBasePath?: string;
}

function buildQuery(params: Record<string, string | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q.set(k, v);
  }
  return q.toString();
}

export function RecruiterActivityDashboard({
  isAdmin,
  tenantId,
  detailBasePath = "/recruiter-activity",
  exportBasePath = "/api/recruiter-activity/export",
}: DashboardProps) {
  const [preset, setPreset] = useState<DatePreset>("last_7_days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Record<string, KpiPayload> | null>(null);
  const [definitions, setDefinitions] = useState(KPI_DEFINITIONS);
  const [recruiters, setRecruiters] = useState<ProductivityTableRow[]>([]);
  const [feed, setFeed] = useState<FeedItemView[]>([]);
  const [feedPagination, setFeedPagination] = useState<FeedPagination | null>(null);
  const [feedPage, setFeedPage] = useState(1);
  const [inactivity, setInactivity] = useState<{
    noActivity24h: number;
    noActivity3d: number;
    noActivity7d: number;
    assignedWithoutNotes: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const queryCommon = useMemo(
    () => ({
      preset,
      from: preset === "custom" ? customFrom : null,
      to: preset === "custom" ? customTo : null,
      tenantId: tenantId ?? null,
      search: search || null,
      status: statusFilter === "all" ? null : statusFilter,
    }),
    [preset, customFrom, customTo, tenantId, search, statusFilter]
  );

  const loadFeed = useCallback(
    async (page: number, opts?: { quiet?: boolean }) => {
      if (preset === "custom" && (!customFrom || !customTo)) return;
      if (!opts?.quiet) setFeedLoading(true);
      try {
        const qs = buildQuery({
          ...queryCommon,
          limit: String(FEED_PAGE_SIZE),
          page: String(page),
        });
        const feedRes = await fetch(`/api/recruiter-activity/feed?${qs}`);
        const feedJson = await feedRes.json();
        if (!feedRes.ok || !feedJson.success) {
          throw new Error(feedJson.error || "Failed to load activity feed.");
        }
        setFeed(feedJson.items ?? []);
        setFeedPagination(feedJson.pagination ?? null);
        setFeedPage(feedJson.pagination?.page ?? page);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load activity feed.");
      } finally {
        setFeedLoading(false);
      }
    },
    [queryCommon, preset, customFrom, customTo]
  );

  const load = useCallback(async () => {
    if (preset === "custom" && (!customFrom || !customTo)) return;
    setLoading(true);
    setError(null);
    setFeedPage(1);
    try {
      const qs = buildQuery(queryCommon);
      const [kpisRes, recruitersRes, feedRes, inactivityRes] = await Promise.all([
        fetch(`/api/recruiter-activity/kpis?${qs}`),
        fetch(`/api/recruiter-activity/recruiters?${qs}`),
        fetch(
          `/api/recruiter-activity/feed?${qs}&limit=${FEED_PAGE_SIZE}&page=1`
        ),
        fetch(`/api/recruiter-activity/inactivity?${qs}`),
      ]);

      if (!kpisRes.ok || !recruitersRes.ok || !feedRes.ok || !inactivityRes.ok) {
        throw new Error("Failed to load recruiter activity.");
      }

      const kpisJson = await kpisRes.json();
      const recruitersJson = await recruitersRes.json();
      const feedJson = await feedRes.json();
      const inactivityJson = await inactivityRes.json();

      if (!kpisJson.success || !recruitersJson.success || !feedJson.success || !inactivityJson.success) {
        throw new Error(
          kpisJson.error ||
            recruitersJson.error ||
            feedJson.error ||
            inactivityJson.error ||
            "Failed to load recruiter activity."
        );
      }

      setKpis(kpisJson.kpis);
      setDefinitions(kpisJson.definitions ?? KPI_DEFINITIONS);
      setRecruiters(recruitersJson.recruiters ?? []);
      setFeed(feedJson.items ?? []);
      setFeedPagination(feedJson.pagination ?? null);
      setInactivity(inactivityJson.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [queryCommon, preset, customFrom, customTo, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFeedPageChange(page: number) {
    setFeedPage(page);
    await loadFeed(page);
  }
  async function handleExport() {
    setExporting(true);
    try {
      const qs = buildQuery({ ...queryCommon, type: "productivity" });
      const res = await fetch(`${exportBasePath}?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recruiter-productivity.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const tooltipFor = (key: string) =>
    definitions.find((d) => d.key === key)?.tooltip ?? "";

  const formatKpiValue = (key: string, value: number | null | undefined) => {
    if (value == null) return "—";
    if (key === "avgFollowUpHours") return `${value}h`;
    return value;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recruiter Activity</h1>
          <p className="mt-1 text-sm text-slate-500">
            Measure recruiter productivity from real platform activity
            {isAdmin ? " across your tenant" : " for your account"}.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setReloadToken((n) => n + 1)}
        >
          Refresh
        </Button>
      </div>

      <DateRangeFilters
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={(next) => {
          setFeedPage(1);
          setPreset(next);
        }}
        onCustomChange={(from, to) => {
          setFeedPage(1);
          setCustomFrom(from);
          setCustomTo(to);
        }}
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setReloadToken((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {definitions.map((def) => (
          <ActivityKpiCard
            key={def.key}
            label={def.label}
            value={formatKpiValue(def.key, kpis?.[def.key]?.value ?? null)}
            changePercent={kpis?.[def.key]?.changePercent ?? null}
            tooltip={tooltipFor(def.key)}
            loading={loading && !kpis}
          />
        ))}
      </div>

      {inactivity && (
        <Card>
          <CardHeader
            title="Follow-up & inactivity"
            description="Assigned candidates that may need attention."
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-xs font-medium uppercase text-amber-800">No activity 24h</p>
                <p className="mt-1 text-2xl font-bold text-amber-900">{inactivity.noActivity24h}</p>
              </div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3">
                <p className="text-xs font-medium uppercase text-orange-800">No activity 3d</p>
                <p className="mt-1 text-2xl font-bold text-orange-900">{inactivity.noActivity3d}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
                <p className="text-xs font-medium uppercase text-rose-800">No activity 7d</p>
                <p className="mt-1 text-2xl font-bold text-rose-900">{inactivity.noActivity7d}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-medium uppercase text-slate-600">Assigned w/o notes</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {inactivity.assignedWithoutNotes}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <RecruiterProductivityTable
        rows={recruiters}
        loading={loading && recruiters.length === 0}
        search={search}
        statusFilter={statusFilter}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
        onExport={handleExport}
        exporting={exporting}
        detailBasePath={detailBasePath}
        tenantId={tenantId}
      />

      <ActivityFeed
        items={feed}
        loading={(loading || feedLoading) && feed.length === 0}
        error={null}
        onRetry={() => setReloadToken((n) => n + 1)}
        pagination={feedPagination}
        onPageChange={(page) => {
          void handleFeedPageChange(page);
        }}
      />
    </div>
  );
}
