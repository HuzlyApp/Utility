"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Card, CardBody, CardHeader, Button } from "@/components/ui/primitives";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useJobSidebarPreference } from "@/hooks/use-job-sidebar-preference";
import { JobDescriptionPanel } from "@/components/workspace/job-description-panel";

export interface JobWorkspaceSidebarContent {
  specialty?: string | null;
  department?: string | null;
  location?: string | null;
  shift?: string | null;
  startDate?: string | null;
  candidateCount: number;
  mandatoryRequirements?: string | null;
  preferredRequirements?: string | null;
  jobDescriptionText: string;
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="break-words font-medium text-slate-700 sm:text-right">
        {value || "—"}
      </span>
    </div>
  );
}

function CardCollapseButton({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <ChevronDownIcon
        className={cn(
          "h-4 w-4 transition-transform duration-200",
          expanded ? "rotate-0" : "-rotate-90"
        )}
      />
    </button>
  );
}

function SidebarToggleButton({
  expanded,
  panelId,
  onToggle,
  className,
}: {
  expanded: boolean;
  panelId: string;
  onToggle: () => void;
  className?: string;
}) {
  const label = expanded ? "Collapse job details" : "Expand job details";
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg",
        "border border-slate-200 bg-white text-slate-600 shadow-sm",
        "transition-colors hover:bg-slate-50 hover:text-slate-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        className
      )}
    >
      {expanded ? (
        <ChevronLeftIcon className="h-4 w-4 transition-transform duration-200" />
      ) : (
        <ChevronRightIcon className="h-4 w-4 transition-transform duration-200" />
      )}
    </button>
  );
}

function JobDetailsCards({
  content,
  summaryExpanded,
  onSummaryToggle,
  jdExpanded,
  onJdExpandedChange,
}: {
  content: JobWorkspaceSidebarContent;
  summaryExpanded: boolean;
  onSummaryToggle: () => void;
  jdExpanded: boolean;
  onJdExpandedChange: (expanded: boolean) => void;
}) {
  const hasRequirements =
    Boolean(content.mandatoryRequirements) || Boolean(content.preferredRequirements);

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
      <Card>
        <CardHeader
          title="Job summary"
          action={
            <CardCollapseButton
              expanded={summaryExpanded}
              onToggle={onSummaryToggle}
              label={summaryExpanded ? "Collapse job summary" : "Expand job summary"}
            />
          }
        />
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-in-out",
            summaryExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <CardBody className="space-y-2 text-sm">
              <SummaryRow label="Specialty" value={content.specialty} />
              <SummaryRow label="Department" value={content.department} />
              <SummaryRow label="Location" value={content.location} />
              <SummaryRow label="Shift" value={content.shift} />
              <SummaryRow label="Start date" value={content.startDate} />
              <SummaryRow label="Candidates" value={String(content.candidateCount)} />
            </CardBody>
          </div>
        </div>
      </Card>

      {hasRequirements && (
        <Card>
          <CardHeader title="Saved requirements" />
          <CardBody className="space-y-3 text-sm">
            {content.mandatoryRequirements && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  Mandatory
                </p>
                <p className="whitespace-pre-line break-words text-slate-700">
                  {content.mandatoryRequirements}
                </p>
              </div>
            )}
            {content.preferredRequirements && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  Preferred
                </p>
                <p className="whitespace-pre-line break-words text-slate-700">
                  {content.preferredRequirements}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <JobDescriptionPanel
        text={content.jobDescriptionText}
        cardExpanded={jdExpanded}
        onCardExpandedChange={onJdExpandedChange}
      />
    </div>
  );
}

export function JobWorkspaceLayout({
  userId,
  main,
  sidebar,
}: {
  userId: string;
  main: React.ReactNode;
  sidebar: JobWorkspaceSidebarContent;
}) {
  const {
    sidebarExpanded,
    setSidebarExpanded,
    summaryExpanded,
    setSummaryExpanded,
    jdExpanded,
    setJdExpanded,
  } = useJobSidebarPreference(userId);

  const panelId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function closeMobileDrawer() {
    setMobileOpen(false);
    queueMicrotask(() => mobileTriggerRef.current?.focus());
  }

  const cards = (
    <JobDetailsCards
      content={sidebar}
      summaryExpanded={summaryExpanded}
      onSummaryToggle={() => setSummaryExpanded((v) => !v)}
      jdExpanded={jdExpanded}
      onJdExpandedChange={setJdExpanded}
    />
  );

  return (
    <div
      className={cn(
        "grid gap-6 transition-[grid-template-columns] duration-300 ease-in-out",
        "xl:grid-cols-[minmax(0,1fr)_auto]"
      )}
    >
      <div className="min-w-0 space-y-6">{main}</div>

      {/* Desktop rail (xl+) */}
      <aside
        className={cn(
          "relative hidden self-start xl:block",
          "transition-[width] duration-300 ease-in-out will-change-[width]",
          sidebarExpanded ? "w-[320px]" : "w-10"
        )}
      >
        <SidebarToggleButton
          expanded={sidebarExpanded}
          panelId={panelId}
          onToggle={() => setSidebarExpanded((v) => !v)}
          className="absolute left-0 top-3 z-10 -translate-x-1/2"
        />

        <div
          id={panelId}
          className={cn(
            "transition-[opacity,transform] duration-300 ease-in-out",
            sidebarExpanded
              ? "relative translate-x-0 opacity-100"
              : "pointer-events-none absolute right-0 top-0 w-[320px] translate-x-2 opacity-0"
          )}
          aria-hidden={!sidebarExpanded}
        >
          {cards}
        </div>

        {/* Keep rail clickable height when collapsed */}
        {!sidebarExpanded && <div className="h-14" aria-hidden />}
      </aside>

      {/* Tablet (md–xl): inline collapsible section */}
      <div className="hidden md:block xl:hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">Job details</p>
          <SidebarToggleButton
            expanded={sidebarExpanded}
            panelId={`${panelId}-tablet`}
            onToggle={() => setSidebarExpanded((v) => !v)}
          />
        </div>
        <div
          id={`${panelId}-tablet`}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
            sidebarExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
          aria-hidden={!sidebarExpanded}
        >
          <div className="overflow-hidden">{sidebarExpanded ? cards : null}</div>
        </div>
      </div>

      {/* Mobile: compact bar + slide-over drawer */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Job details</p>
            <p className="truncate text-xs text-slate-500">
              Summary and full job description
            </p>
          </div>
          <Button
            ref={mobileTriggerRef}
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={mobileOpen}
            aria-controls={`${panelId}-mobile`}
            aria-label="Expand job details"
            title="Expand job details"
            onClick={() => setMobileOpen(true)}
          >
            <ChevronRightIcon className="h-4 w-4" />
            Show
          </Button>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 overflow-x-hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/40"
              aria-label="Close job details"
              onClick={closeMobileDrawer}
            />
            <aside
              id={`${panelId}-mobile`}
              className={cn(
                "absolute inset-y-0 right-0 flex w-full max-w-md flex-col",
                "border-l border-slate-200 bg-slate-50 shadow-xl",
                "transition-transform duration-300 ease-in-out"
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Job details</h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Collapse job details"
                  title="Collapse job details"
                  onClick={closeMobileDrawer}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto overflow-x-hidden p-4">{cards}</div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
