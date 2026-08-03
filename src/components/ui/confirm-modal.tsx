"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/primitives";
import { AlertIcon, InfoIcon, CheckIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type ConfirmVariant = "default" | "warning" | "destructive" | "success";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  warning?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmLoadingLabel?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
  error?: string | null;
  icon?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const VARIANT_STYLES: Record<
  ConfirmVariant,
  {
    iconWrap: string;
    confirmVariant: "primary" | "danger" | "secondary";
    defaultIcon: React.ReactNode;
  }
> = {
  default: {
    iconWrap: "bg-slate-100 text-slate-600",
    confirmVariant: "primary",
    defaultIcon: <InfoIcon className="h-5 w-5" />,
  },
  warning: {
    iconWrap: "bg-amber-100 text-amber-700",
    confirmVariant: "primary",
    defaultIcon: <AlertIcon className="h-5 w-5" />,
  },
  destructive: {
    iconWrap: "bg-red-100 text-red-600",
    confirmVariant: "danger",
    defaultIcon: <AlertIcon className="h-5 w-5" />,
  },
  success: {
    iconWrap: "bg-green-100 text-green-700",
    confirmVariant: "primary",
    defaultIcon: <CheckIcon className="h-5 w-5" />,
  },
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter((el) => !el.hasAttribute("disabled"));
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  warning,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmLoadingLabel = "Working…",
  variant = "default",
  isLoading = false,
  error = null,
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const styles = VARIANT_STYLES[variant];

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTarget =
      variant === "destructive" ? cancelRef.current : confirmRef.current;
    const t = window.setTimeout(() => focusTarget?.focus(), 0);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, variant]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isLoading) return;
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const content = (
    <div
      className="confirm-modal-overlay fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (isLoading) return;
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="confirm-modal-panel w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="max-h-[min(80vh,640px)] overflow-y-auto px-5 py-5">
          <div className="flex gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                styles.iconWrap
              )}
            >
              {icon ?? styles.defaultIcon}
            </div>
            <div className="min-w-0 flex-1">
              <h3
                id={titleId}
                className="text-base font-semibold text-slate-900"
              >
                {title}
              </h3>
              <div
                id={descriptionId}
                className="mt-2 text-sm leading-relaxed text-slate-600"
              >
                {description}
              </div>
              {warning ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {warning}
                </p>
              ) : null}
              {error ? (
                <p
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
            {!isLoading && (
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={isLoading}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={styles.confirmVariant}
            className="w-full sm:w-auto"
            disabled={isLoading}
            onClick={() => {
              void onConfirm();
            }}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                {confirmLoadingLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
