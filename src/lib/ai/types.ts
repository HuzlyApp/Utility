import type { AiResult } from "@/lib/schema";
import type { UserPromptArgs } from "@/lib/prompt";
import type { NormalizedJobRequirements } from "@/lib/job-cache";
import type { AnalysisMode } from "@/lib/types";
export type { NormalizedJobRequirements } from "@/lib/job-cache";

/** Supported AI providers for candidate-to-job matching. */
export const AI_PROVIDERS = ["claude", "grok"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/**
 * UI-facing model choices for analysis.
 * Claude is the only selectable analysis provider.
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
  /** Concrete API model id (e.g. claude-sonnet-4-…). */
  model: string;
  /** Stable UI option id. */
  optionId: AiModelOptionId;
}

export interface AnalysisPerformanceMetrics {
  prompt_build_ms: number;
  claude_time_to_first_token_ms: number;
  claude_generation_ms: number;
  json_parse_ms: number;
  validation_ms: number;
  repair_retry_ms: number;
  scoring_ms: number;
  persistence_ms: number;
  client_render_ms: number;
  total_duration_ms: number;
}

export interface ProviderCallResult {
  content: string;
  model: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Granular performance timings when available. */
  perf?: AnalysisPerformanceMetrics;
  /** Anthropic stop_reason when available (e.g. end_turn, max_tokens). */
  stopReason?: string;
  /** Provider-internal timing metadata (not part of public contract). */
  _timeToFirstByteMs?: number;
  _generationMs?: number;
}

export interface ProviderAdapter {
  readonly provider: AiProvider;
  isConfigured(): boolean;
  unavailableMessage(): string;
  resolveModel(requested?: string): string;
  complete(
    messages: ChatMessage[],
    opts: {
      model: string;
      attemptNumber: number;
      meta: AnalysisCallMeta;
      maxTokens?: number;
    }
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
  analysisMode?: AnalysisMode;
}

export interface AnalyzeCandidateArgs extends UserPromptArgs {
  provider: AiProvider;
  /** Optional concrete model override; otherwise provider default from config. */
  model?: string;
  optionId?: AiModelOptionId;
  /** Lean Analyze vs existing Deeper Analysis. Defaults to analyze. */
  analysisMode?: AnalysisMode;
  /** Cached normalized job requirements to reduce prompt size. */
  cached_job_requirements?: import("@/lib/ai/job-cache").CachedJobRequirements;
}

export interface AnalyzeCandidateResult {
  aiResult: AiResult;
  rawResponse: string;
  repaired: boolean;
  provider: AiProvider;
  model: string;
  optionId: AiModelOptionId;
  tokenUsage?: ProviderCallResult["tokenUsage"];
  perf?: AnalysisPerformanceMetrics;
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
  if (model) {
    if (model.toLowerCase().includes("claude")) return "Claude";
    return model;
  }
  return "Claude";
}
