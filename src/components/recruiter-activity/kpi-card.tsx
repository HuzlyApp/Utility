"use client";

import React from "react";
import { Card, CardBody } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export function ActivityKpiCard({
  label,
  value,
  changePercent,
  tooltip,
  loading,
}: {
  label: string;
  value: string | number | null;
  changePercent: number | null;
  tooltip: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardBody className="py-4">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-100" />
        </CardBody>
      </Card>
    );
  }

  const delta =
    changePercent == null
      ? "New"
      : `${changePercent > 0 ? "+" : ""}${changePercent}%`;
  const tone =
    changePercent == null
      ? "text-slate-500"
      : changePercent > 0
        ? "text-emerald-600"
        : changePercent < 0
          ? "text-rose-600"
          : "text-slate-500";

  return (
    <Card title={tooltip}>
      <CardBody className="py-4" title={tooltip}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
          {value ?? "—"}
        </p>
        <p className={cn("mt-1 text-xs font-medium", tone)} title={tooltip}>
          {delta} vs previous period
        </p>
      </CardBody>
    </Card>
  );
}
