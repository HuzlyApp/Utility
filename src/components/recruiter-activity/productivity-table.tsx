"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatRelativeTime, PRODUCTIVITY_SCORE_TOOLTIP } from "@/lib/recruiter-activity";

export interface ProductivityTableRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
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
  avgFollowUpHours: number | null;
  lastActivityAt: string | null;
  productivityScore: number;
}

type SortKey = keyof ProductivityTableRow;

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "name", label: "Recruiter Name" },
  { key: "role", label: "Role" },
  { key: "assignedCandidates", label: "Assigned", numeric: true },
  { key: "candidatesAdded", label: "Added", numeric: true },
  { key: "candidatesWorked", label: "Worked", numeric: true },
  { key: "analysesCompleted", label: "Analyses", numeric: true },
  { key: "notesAdded", label: "Notes", numeric: true },
  { key: "statusChanges", label: "Status", numeric: true },
  { key: "qualified", label: "Qualified", numeric: true },
  { key: "submitted", label: "Submitted", numeric: true },
  { key: "interviews", label: "Interviews", numeric: true },
  { key: "offers", label: "Offers", numeric: true },
  { key: "hired", label: "Hired", numeric: true },
  { key: "rejected", label: "Rejected", numeric: true },
  { key: "avgFollowUpHours", label: "Avg Follow-Up", numeric: true },
  { key: "lastActivityAt", label: "Last Activity" },
  { key: "productivityScore", label: "Score", numeric: true },
];

export function RecruiterProductivityTable({
  rows,
  loading,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onExport,
  exporting,
  detailBasePath = "/recruiter-activity",
  tenantId,
}: {
  rows: ProductivityTableRow[];
  loading?: boolean;
  search: string;
  statusFilter: "all" | "active" | "inactive";
  onSearchChange: (v: string) => void;
  onStatusFilterChange: (v: "all" | "active" | "inactive") => void;
  onExport: () => void;
  exporting?: boolean;
  detailBasePath?: string;
  tenantId?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("productivityScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Recruiter productivity"
        description="One row per recruiter for the selected period."
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exporting || rows.length === 0}
            onClick={onExport}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as "all" | "active" | "inactive")
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">No recruiter activity found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try selecting a different date range or recruiter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={
                        col.key === "name"
                          ? "sticky left-0 z-10 bg-white px-3 py-2"
                          : "px-3 py-2"
                      }
                    >
                      <button
                        type="button"
                        className="font-semibold hover:text-slate-800"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2" title={PRODUCTIVITY_SCORE_TOOLTIP}>
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.userId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-900">
                      <div>{row.name}</div>
                      <div className="text-xs font-normal text-slate-500">{row.email}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.role}</td>
                    <td className="px-3 py-2">{row.assignedCandidates}</td>
                    <td className="px-3 py-2">{row.candidatesAdded}</td>
                    <td className="px-3 py-2">{row.candidatesWorked}</td>
                    <td className="px-3 py-2">{row.analysesCompleted}</td>
                    <td className="px-3 py-2">{row.notesAdded}</td>
                    <td className="px-3 py-2">{row.statusChanges}</td>
                    <td className="px-3 py-2">{row.qualified}</td>
                    <td className="px-3 py-2">{row.submitted}</td>
                    <td className="px-3 py-2">{row.interviews}</td>
                    <td className="px-3 py-2">{row.offers}</td>
                    <td className="px-3 py-2">{row.hired}</td>
                    <td className="px-3 py-2">{row.rejected}</td>
                    <td className="px-3 py-2">
                      {row.avgFollowUpHours == null ? "—" : `${row.avgFollowUpHours}h`}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.lastActivityAt
                        ? formatRelativeTime(row.lastActivityAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold" title={PRODUCTIVITY_SCORE_TOOLTIP}>
                      {row.productivityScore}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`${detailBasePath}/${row.userId}${
                          tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""
                        }`}
                        className="text-brand-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
