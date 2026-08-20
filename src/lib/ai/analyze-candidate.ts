import {
  systemPromptForMode,
  buildUserPrompt,
  buildRepairPrompt,
} from "@/lib/prompt";
import { parseAiResult, isLikelyTruncatedJsonError } from "@/lib/schema";
import { getClaudeMaxTokensForAnalysis } from "@/lib/config";
import { claudeProvider } from "./providers/claude";
import { logAnalysisOperation } from "./log";
import {
  PerformanceTimer,
  logPerformanceMetrics,
  categorizeValidationError,
} from "./performance";
import type { PerformanceReport } from "./performance";
import {
  AiServiceError,
  AiValidationError,
  ConfigurationError,
  EmptyResponseError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
} from "./errors";
import type {
  AiModelOptionId,
  AiProvider,
  AnalyzeCandidateArgs,
  AnalyzeCandidateResult,
  AnalysisCallMeta,
  ChatMessage,
  ProviderAdapter,
} from "./types";
import { DEFAULT_AI_MODEL_OPTION } from "./types";
import { DEFAULT_ANALYSIS_MODE } from "@/lib/types";

const adapters: Record<AiProvider, ProviderAdapter> = {
  grok: claudeProvider, // Grok disabled - route to Claude
  claude: claudeProvider,
};

export function getProviderAdapter(provider: AiProvider): ProviderAdapter {
  return adapters[provider];
}

function optionIdFor(
  _provider: AiProvider,
  explicit?: AiModelOptionId
): AiModelOptionId {
  if (explicit) return explicit;
  return DEFAULT_AI_MODEL_OPTION;
}

/**
 * Unified candidate analysis entry point.
 * Routes to the selected provider adapter with identical prompts and schema validation.
 * Never falls back to another provider automatically.
 */
export async function analyzeCandidate(
  args: AnalyzeCandidateArgs,
  meta?: Partial<
    Omit<
      AnalysisCallMeta,
      "provider" | "model" | "inputCharCount" | "resumeCharCount" | "jobCharCount"
    >
  >
): Promise<AnalyzeCandidateResult & { perf?: PerformanceReport }> {
  if (args.provider === "grok") {
    throw new ProviderUnavailableError(
      "Grok analysis is disabled. Use Claude.",
      "grok"
    );
  }

  const adapter = getProviderAdapter(args.provider);

  if (!adapter.isConfigured()) {
    throw new ProviderUnavailableError(
      adapter.unavailableMessage(),
      args.provider
    );
  }

  const model = adapter.resolveModel(args.model);
  const optionId = optionIdFor(args.provider, args.optionId);

  const analysisMode = args.analysisMode ?? DEFAULT_ANALYSIS_MODE;

  const analysisMeta: AnalysisCallMeta = {
    analysisId: meta?.analysisId,
    tenantId: meta?.tenantId,
    userId: meta?.userId,
    inputCharCount:
      args.job_description_text.length + args.resume_text.length,
    resumeCharCount: args.resume_text.length,
    jobCharCount: args.job_description_text.length,
    provider: args.provider,
    model,
    analysisMode,
  };

  logAnalysisOperation("analysis_started", analysisMeta, { analysisMode });
  const timer = new PerformanceTimer();
  timer.start("prompt_build");

  const userPrompt = buildUserPrompt({ ...args, analysisMode });
  const baseMessages: ChatMessage[] = [
    { role: "system", content: systemPromptForMode(analysisMode) },
    { role: "user", content: userPrompt },
  ];

  timer.end("prompt_build");
  timer.start("claude_time_to_first_token");
  timer.start("claude_generation");

  const maxTokens = getClaudeMaxTokensForAnalysis(args.resume_text.length);

  try {
    const firstResponse = await adapter.complete(baseMessages, {
      model,
      attemptNumber: 1,
      meta: analysisMeta,
      maxTokens,
    });
    const firstRaw = firstResponse.content;
    const firstTruncated =
      firstResponse.stopReason === "max_tokens" ||
      (firstResponse.tokenUsage?.completionTokens != null &&
        firstResponse.tokenUsage.completionTokens >= maxTokens - 16);

    // Use provider-reported TTFB if available
    const ttfbMs =
      (firstResponse as { _timing?: { timeToFirstByteMs: number } })._timing
        ?.timeToFirstByteMs ?? 0;

    timer.end("claude_time_to_first_token");
    timer.end("claude_generation");
    timer.start("json_parse");

    if (!firstRaw || firstRaw.trim().length === 0) {
      logAnalysisOperation("empty_response", analysisMeta, { attempt: 1 });
      throw new EmptyResponseError(
        `${args.provider === "claude" ? "Claude" : "Grok"} returned an empty response.`
      );
    }

    const firstParsed = parseAiResult(firstRaw, analysisMode);
    timer.end("json_parse");
    timer.start("validation");

    if (firstParsed.ok) {
      timer.end("validation");
      logAnalysisOperation("validation_passed", analysisMeta, {
        attempt: 1,
        repaired: false,
        matchCategory: firstParsed.data.candidate_match.match_category,
      });
      return {
        aiResult: firstParsed.data,
        rawResponse: firstRaw,
        repaired: false,
        provider: args.provider,
        model,
        optionId,
        tokenUsage: firstResponse.tokenUsage,
        perf: {
          prompt_build_ms: Math.round(timer.duration("prompt_build")),
          claude_time_to_first_token_ms: Math.round(ttfbMs),
          claude_generation_ms: Math.round(timer.duration("claude_generation")),
          json_parse_ms: Math.round(timer.duration("json_parse")),
          validation_ms: Math.round(timer.duration("validation")),
          repair_retry_ms: 0,
          scoring_ms: 0,
          persistence_ms: 0,
          client_render_ms: 0,
          total_duration_ms: Math.round(timer.total()),
        },
      };
    }

    timer.end("validation");
    const repairErrorCategory = categorizeValidationError(firstParsed.error);
    logAnalysisOperation("validation_failed", analysisMeta, {
      attempt: 1,
      errorCategory: repairErrorCategory,
      error: firstParsed.error,
    });

    timer.start("repair_retry");
    const truncated =
      firstTruncated || isLikelyTruncatedJsonError(firstParsed.error);
    const repairMessages: ChatMessage[] = [
      ...baseMessages,
      { role: "assistant", content: firstRaw },
      {
        role: "user",
        content: buildRepairPrompt(firstRaw, firstParsed.error, {
          truncated,
          analysisMode,
        }),
      },
    ];

    const repairResponse = await adapter.complete(repairMessages, {
      model,
      attemptNumber: 2,
      meta: analysisMeta,
      maxTokens,
    });
    const repairRaw = repairResponse.content;

    if (!repairRaw || repairRaw.trim().length === 0) {
      logAnalysisOperation("empty_response", analysisMeta, { attempt: 2 });
      throw new EmptyResponseError(
        `${args.provider === "claude" ? "Claude" : "Grok"} returned an empty response on retry.`
      );
    }

    const repairParsed = parseAiResult(repairRaw, analysisMode);
    timer.end("repair_retry");

    if (repairParsed.ok) {
      logAnalysisOperation("validation_passed", analysisMeta, {
        attempt: 2,
        repaired: true,
        matchCategory: repairParsed.data.candidate_match.match_category,
      });
      return {
        aiResult: repairParsed.data,
        rawResponse: repairRaw,
        repaired: true,
        provider: args.provider,
        model,
        optionId,
        tokenUsage: repairResponse.tokenUsage,
        perf: {
          prompt_build_ms: Math.round(timer.duration("prompt_build")),
          claude_time_to_first_token_ms: Math.round(ttfbMs),
          claude_generation_ms: Math.round(timer.duration("claude_generation")),
          json_parse_ms: Math.round(timer.duration("json_parse")),
          validation_ms: Math.round(timer.duration("validation")),
          repair_retry_ms: Math.round(timer.duration("repair_retry")),
          scoring_ms: 0,
          persistence_ms: 0,
          client_render_ms: 0,
          total_duration_ms: Math.round(timer.total()),
        },
      };
    }

    logAnalysisOperation("repair_failed", analysisMeta, {
      firstError: firstParsed.error,
      repairError: repairParsed.error,
      firstErrorCategory: repairErrorCategory,
      repairErrorCategory: categorizeValidationError(repairParsed.error),
    });

    throw new AiValidationError(
      "The analysis response failed validation after one repair attempt.",
      { first: firstParsed.error, repair: repairParsed.error }
    );
  } catch (error) {
    if (
      error instanceof AiValidationError ||
      error instanceof RateLimitError ||
      error instanceof TimeoutError ||
      error instanceof EmptyResponseError ||
      error instanceof ConfigurationError ||
      error instanceof ProviderUnavailableError ||
      error instanceof AiServiceError
    ) {
      throw error;
    }

    logAnalysisOperation("unexpected_error", analysisMeta, {
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new AiServiceError(
      "An unexpected error occurred during analysis.",
      error
    );
  }
}

/** @deprecated Prefer analyzeCandidate — kept for callers that still use runAnalysis. */
export async function runAnalysis(
  args: Omit<AnalyzeCandidateArgs, "provider" | "model" | "optionId"> & {
    provider?: AiProvider;
    model?: string;
  },
  meta?: Partial<
    Omit<
      AnalysisCallMeta,
      "provider" | "model" | "inputCharCount" | "resumeCharCount" | "jobCharCount"
    >
  >
): Promise<{
  aiResult: AnalyzeCandidateResult["aiResult"];
  rawResponse: string;
  repaired: boolean;
  model: string;
  provider: AiProvider;
  tokenUsage?: AnalyzeCandidateResult["tokenUsage"];
  perf?: PerformanceReport;
}> {
  const result = await analyzeCandidate(
    {
      ...args,
      provider: args.provider ?? "claude",
      model: args.model,
    },
    meta
  );
  return {
    aiResult: result.aiResult,
    rawResponse: result.rawResponse,
    repaired: result.repaired,
    model: result.model,
    provider: result.provider,
    tokenUsage: result.tokenUsage,
    perf: result.perf,
  };
}
