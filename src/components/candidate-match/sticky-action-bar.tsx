"use client";

import React from "react";
import { Button } from "@/components/ui/primitives";

export function StickyActionBar({
  onBack,
  onSaveDraft,
  primaryLabel,
  primaryIcon,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  hint,
}: {
  onBack?: () => void;
  onSaveDraft?: () => void;
  primaryLabel: string;
  primaryIcon?: React.ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  hint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-slate-200 bg-white/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          )}
          {onSaveDraft && (
            <Button variant="ghost" onClick={onSaveDraft}>
              Save Draft
            </Button>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button
            size="lg"
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading}
            className="w-full sm:w-auto"
          >
            {primaryIcon}
            {primaryLoading ? "Working…" : primaryLabel}
          </Button>
          {hint && <span className="text-xs text-slate-400">{hint}</span>}
        </div>
      </div>
    </div>
  );
}
