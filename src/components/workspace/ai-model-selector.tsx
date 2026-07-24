"use client";

import { cn } from "@/lib/cn";
import {
  AI_MODEL_OPTIONS,
  type AiModelOptionId,
  type AiProvider,
} from "@/lib/ai/types";

export type ProviderAvailability = Record<
  AiProvider,
  { available: boolean; message?: string }
>;

export function AiModelSelector({
  value,
  onChange,
  disabled,
  availability,
  className,
}: {
  value: AiModelOptionId;
  onChange: (next: AiModelOptionId) => void;
  disabled?: boolean;
  availability?: ProviderAvailability | null;
  className?: string;
}) {
  const selectedProvider =
    AI_MODEL_OPTIONS.find((o) => o.id === value)?.provider ?? "claude";

  // Single selectable provider — show a compact label instead of a toggle group.
  if (AI_MODEL_OPTIONS.length === 1) {
    const only = AI_MODEL_OPTIONS[0];
    const unavailable = availability
      ? !availability[only.provider]?.available
      : false;
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          AI Model
        </span>
        <div
          className={cn(
            "inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800",
            (disabled || unavailable) && "opacity-50"
          )}
        >
          {only.label}
        </div>
        {unavailable && (
          <p className="text-xs text-red-600">
            {availability?.[only.provider]?.message ??
              `${only.label} is unavailable`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        AI Model
      </span>
      <div
        role="group"
        aria-label="AI model"
        className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5"
      >
        {AI_MODEL_OPTIONS.map((opt) => {
          const unavailable = availability
            ? !availability[opt.provider]?.available
            : false;
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || unavailable}
              title={
                unavailable
                  ? availability?.[opt.provider]?.message ??
                    `${opt.label} is unavailable`
                  : opt.label
              }
              onClick={() => onChange(opt.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900",
                (disabled || unavailable) && "cursor-not-allowed opacity-50"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {availability && !availability[selectedProvider]?.available && (
        <p className="text-xs text-red-600">
          {availability[selectedProvider]?.message}
        </p>
      )}
    </div>
  );
}

export function ModelBadge({
  provider,
  model,
}: {
  provider?: string | null;
  model?: string | null;
}) {
  if (!provider && !model) return null;

  // Preserve historical Grok labels for past analyses; new work is Claude-only.
  let label = "Claude";
  if (provider === "claude" || (model ?? "").toLowerCase().includes("claude")) {
    label = "Claude";
  } else if (provider === "grok" || (model ?? "").toLowerCase().includes("grok")) {
    if (!model || model.includes("4.5") || model === "grok-4.5") label = "Grok 4.5";
    else label = model;
  } else if (model) {
    label = model;
  }

  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
      {label}
    </span>
  );
}
