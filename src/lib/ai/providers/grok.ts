import OpenAI from "openai";
import { config } from "@/lib/config";
import {
  ConfigurationError,
  RateLimitError,
  TimeoutError,
} from "../errors";
import { logAnalysisOperation } from "../log";
import type {
  AnalysisCallMeta,
  ChatMessage,
  ProviderAdapter,
  ProviderCallResult,
} from "../types";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.xaiApiKey) {
    throw new ConfigurationError("XAI_API_KEY is not configured on the server.");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.xaiApiKey,
      baseURL: config.grokBaseUrl,
      timeout: config.xaiTimeoutMs,
      maxRetries: config.xaiMaxRetries,
    });
  }
  return client;
}

export const grokProvider: ProviderAdapter = {
  provider: "grok",

  isConfigured() {
    return Boolean(config.xaiApiKey);
  },

  unavailableMessage() {
    return "Grok 4.5 is unavailable because XAI_API_KEY is not configured on the server.";
  },

  resolveModel(requested?: string) {
    return requested?.trim() || config.xaiModel;
  },

  async complete(messages, opts): Promise<ProviderCallResult> {
    const startTime = Date.now();
    const meta: AnalysisCallMeta = { ...opts.meta, provider: "grok", model: opts.model };

    try {
      const completion = await getClient().chat.completions.create({
        model: opts.model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: config.xaiTemperature,
        response_format: { type: "json_object" },
        reasoning_effort: config.xaiReasoningEffort,
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
        reasoning_effort?: "low" | "medium" | "high";
      });

      const content = completion.choices[0]?.message?.content ?? "";
      logAnalysisOperation("request_completed", meta, {
        attempt: opts.attemptNumber,
        durationMs: Date.now() - startTime,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        responseLength: content.length,
      });

      return {
        content,
        model: opts.model,
        tokenUsage: {
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      if (error instanceof OpenAI.APIError && error.status === 429) {
        logAnalysisOperation("rate_limit_error", meta, {
          attempt: opts.attemptNumber,
          durationMs,
        });
        throw new RateLimitError(
          "Grok rate limit exceeded. Please try again later."
        );
      }
      if (error instanceof OpenAI.APIError && error.status === 408) {
        logAnalysisOperation("timeout_error", meta, {
          attempt: opts.attemptNumber,
          durationMs,
        });
        throw new TimeoutError(
          "The Grok analysis request timed out. Please try again."
        );
      }
      logAnalysisOperation("request_failed", meta, {
        attempt: opts.attemptNumber,
        durationMs,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      throw error;
    }
  },
};

export type { ChatMessage };
