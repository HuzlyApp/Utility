import type { AiResult } from "@/lib/schema";
import type { UserPromptArgs } from "@/lib/prompt";

/** Supported AI providers for candidate-to-job matching. */
export const AI_PROVIDERS = ["grok", "claude"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/**
 * UI-facing model choices for analysis.
 * Grok is disabled — Claude is the only selectable analysis provider.
 * The "grok" provider type remains for historical analysis records.
 */
export const AI_MODEL_OPTIONS = [
  {
    id: "claude",
    label: "Claude",
    provider: "claude" as const,
    loadingLabel: "Analyzing with Claude…",
  },
] as const;

export type AiModelOptionId = (typeof AI_MODEL_OPTIONS)[number]["id"];
export const DEFAULT_AI_MODEL_OPTION: AiModelOptionId = "claude";

/** Former analysis option ids that are no longer selectable. */
export const DISABLED_AI_MODEL_OPTION_IDS = ["grok-4.5"] as const;

export const ANALYSIS_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export interface AiSelection {
  provider: AiProvider;
  /** Concrete API model id (e.g. grok-4.5, claude-sonnet-4-…). */
  model: string;
  /** Stable UI option id. */
  optionId: AiModelOptionId;
}

export interface ProviderCallResult {
  content: string;
  model: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ProviderAdapter {
  readonly provider: AiProvider;
  isConfigured(): boolean;
  unavailableMessage(): string;
  resolveModel(requested?: string): string;
  complete(
    messages: ChatMessage[],
    opts: { model: string; attemptNumber: number; meta: AnalysisCallMeta }
  ): Promise<ProviderCallResult>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AnalysisCallMeta {
  analysisId?: string;
  tenantId?: string;
  userId?: string;
  inputCharCount: number;
  resumeCharCount: number;
  jobCharCount: number;
  provider: AiProvider;
  model: string;
}

export interface AnalyzeCandidateArgs extends UserPromptArgs {
  provider: AiProvider;
  /** Optional concrete model override; otherwise provider default from config. */
  model?: string;
  optionId?: AiModelOptionId;
}

export interface AnalyzeCandidateResult {
  aiResult: AiResult;
  rawResponse: string;
  repaired: boolean;
  provider: AiProvider;
  model: string;
  optionId: AiModelOptionId;
  tokenUsage?: ProviderCallResult["tokenUsage"];
}

export function isAiProvider(value: unknown): value is AiProvider {
  return (
    typeof value === "string" &&
    (AI_PROVIDERS as readonly string[]).includes(value)
  );
}

export function isAiModelOptionId(value: unknown): value is AiModelOptionId {
  return (
    typeof value === "string" &&
    AI_MODEL_OPTIONS.some((o) => o.id === value)
  );
}

export function displayLabelForSelection(
  provider: AiProvider | null | undefined,
  model: string | null | undefined
): string {
  if (provider === "claude") return "Claude";
  if (provider === "grok") {
    if (!model || model.includes("4.5") || model === "grok-4.5") return "Grok 4.5";
    return model;
  }
  if (model) {
    if (model.toLowerCase().includes("claude")) return "Claude";
    if (model.includes("grok") || model.includes("4.5")) return model.includes("4.5") ? "Grok 4.5" : model;
    return model;
  }
  return "Claude";
}
