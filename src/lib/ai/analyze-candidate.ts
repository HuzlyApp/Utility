import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  buildRepairPrompt,
} from "@/lib/prompt";
import { parseAiResult } from "@/lib/schema";
import { grokProvider } from "./providers/grok";
import { claudeProvider } from "./providers/claude";
import { logAnalysisOperation } from "./log";
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

const adapters: Record<AiProvider, ProviderAdapter> = {
  grok: grokProvider,
  claude: claudeProvider,
};

export function getProviderAdapter(provider: AiProvider): ProviderAdapter {
  return adapters[provider];
}

function optionIdFor(provider: AiProvider, explicit?: AiModelOptionId): AiModelOptionId {
  if (explicit) return explicit;
  return provider === "claude" ? "claude" : DEFAULT_AI_MODEL_OPTION;
}

/**
 * Unified candidate analysis entry point.
 * Routes to the selected provider adapter with identical prompts and schema validation.
 * Never falls back to another provider automatically.
 */
export async function analyzeCandidate(
  args: AnalyzeCandidateArgs,
  meta?: Partial<Omit<AnalysisCallMeta, "provider" | "model" | "inputCharCount" | "resumeCharCount" | "jobCharCount">>
): Promise<AnalyzeCandidateResult> {
  const adapter = getProviderAdapter(args.provider);

  if (!adapter.isConfigured()) {
    throw new ProviderUnavailableError(
      adapter.unavailableMessage(),
      args.provider
    );
  }

  const model = adapter.resolveModel(args.model);
  const optionId = optionIdFor(args.provider, args.optionId);

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
  };

  logAnalysisOperation("analysis_started", analysisMeta);

  const userPrompt = buildUserPrompt(args);
  const baseMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  try {
    const firstResponse = await adapter.complete(baseMessages, {
      model,
      attemptNumber: 1,
      meta: analysisMeta,
    });
    const firstRaw = firstResponse.content;

    if (!firstRaw || firstRaw.trim().length === 0) {
      logAnalysisOperation("empty_response", analysisMeta, { attempt: 1 });
      throw new EmptyResponseError(
        `${args.provider === "claude" ? "Claude" : "Grok"} returned an empty response.`
      );
    }

    const firstParsed = parseAiResult(firstRaw);
    if (firstParsed.ok) {
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
      };
    }

    logAnalysisOperation("validation_failed", analysisMeta, {
      attempt: 1,
      error: firstParsed.error,
    });

    const repairMessages: ChatMessage[] = [
      ...baseMessages,
      { role: "assistant", content: firstRaw },
      { role: "user", content: buildRepairPrompt(firstRaw, firstParsed.error) },
    ];

    const repairResponse = await adapter.complete(repairMessages, {
      model,
      attemptNumber: 2,
      meta: analysisMeta,
    });
    const repairRaw = repairResponse.content;

    if (!repairRaw || repairRaw.trim().length === 0) {
      logAnalysisOperation("empty_response", analysisMeta, { attempt: 2 });
      throw new EmptyResponseError(
        `${args.provider === "claude" ? "Claude" : "Grok"} returned an empty response on retry.`
      );
    }

    const repairParsed = parseAiResult(repairRaw);
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
      };
    }

    logAnalysisOperation("repair_failed", analysisMeta, {
      firstError: firstParsed.error,
      repairError: repairParsed.error,
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
  meta?: Partial<Omit<AnalysisCallMeta, "provider" | "model" | "inputCharCount" | "resumeCharCount" | "jobCharCount">>
): Promise<{
  aiResult: AnalyzeCandidateResult["aiResult"];
  rawResponse: string;
  repaired: boolean;
  model: string;
  provider: AiProvider;
  tokenUsage?: AnalyzeCandidateResult["tokenUsage"];
}> {
  const result = await analyzeCandidate(
    {
      ...args,
      provider: args.provider ?? "grok",
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
  };
}
