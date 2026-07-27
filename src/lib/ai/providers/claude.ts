import { config } from "@/lib/config";
import {
  ConfigurationError,
  RateLimitError,
  TimeoutError,
  AiServiceError,
} from "../errors";
import { logAnalysisOperation } from "../log";
import { PerformanceTimer } from "../performance";
import type {
  AnalysisCallMeta,
  ChatMessage,
  ProviderAdapter,
  ProviderCallResult,
} from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function splitMessages(messages: ChatMessage[]): {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const chat: { role: "user" | "assistant"; content: string }[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      chat.push({ role: m.role, content: m.content });
    }
  }

  // Anthropic requires the conversation to start with a user message.
  if (chat.length === 0 || chat[0].role !== "user") {
    chat.unshift({
      role: "user",
      content: "Return the analysis JSON for the provided materials.",
    });
  }

  return {
    system: systemParts.join("\n\n"),
    messages: chat,
  };
}

export interface ClaudeCallOptions {
  model: string;
  attemptNumber: number;
  meta: AnalysisCallMeta;
  timer?: PerformanceTimer;
  onFirstToken?: () => void;
}

export const claudeProvider: ProviderAdapter = {
  provider: "claude",

  isConfigured() {
    return Boolean(config.claudeApiKey);
  },

  unavailableMessage() {
    return "Claude is unavailable because CLAUDE_API_KEY is not configured on the server.";
  },

  resolveModel(requested?: string) {
    return requested?.trim() || config.claudeModel;
  },

  async complete(
    messages,
    opts: ClaudeCallOptions
  ): Promise<ProviderCallResult> {
    if (!config.claudeApiKey) {
      throw new ConfigurationError(
        "CLAUDE_API_KEY is not configured on the server."
      );
    }

    const timer = opts.timer ?? new PerformanceTimer();
    const startTime = Date.now();
    const meta: AnalysisCallMeta = {
      ...opts.meta,
      provider: "claude",
      model: opts.model,
    };
    const { system, messages: anthropicMessages } = splitMessages(messages);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.claudeTimeoutMs
    );

    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: config.claudeMaxTokens,
      temperature: config.claudeTemperature,
      system,
      messages: anthropicMessages,
    };

    // Enable structured-output beta when available (improves JSON reliability).
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": config.claudeApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
    if (config.claudeStructuredOutput) {
      headers["anthropic-beta"] = "structured-output-2024-09-10";
    }

    // Thinking budget for Claude 3.7+ (disabled by default for speed).
    const thinkingBudget = config.claudeThinkingBudget;
    if (thinkingBudget > 0) {
      body.thinking = { type: "enabled", budget_tokens: thinkingBudget };
      // Thinking requires temperature 1 on some versions;
      // keep temperature 0 for determinism unless thinking is on.
      body.temperature = 1;
    }

    try {
      const fetchStart = Date.now();
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const timeToFirstByte = Date.now() - fetchStart;
      timer.start("claude_time_to_first_token");
      timer.end("claude_time_to_first_token");
      // Override with the actual measured value since timer uses performance.now() internally
      const ttfbOverride = timeToFirstByte;
      opts.onFirstToken?.();

      if (res.status === 429) {
        logAnalysisOperation("rate_limit_error", meta, {
          attempt: opts.attemptNumber,
          durationMs: timeToFirstByte,
        });
        throw new RateLimitError(
          "Claude rate limit exceeded. Please try again later."
        );
      }

      if (res.status === 408 || res.status === 504) {
        logAnalysisOperation("timeout_error", meta, {
          attempt: opts.attemptNumber,
          durationMs: timeToFirstByte,
        });
        throw new TimeoutError(
          "The Claude analysis request timed out. Please try again."
        );
      }

      const bodyJson = (await res.json().catch(() => null)) as {
        content?: Array<
          | { type: string; text?: string; thinking?: string }
          | { type: "thinking"; thinking: string }
        >;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string; type?: string };
      } | null;

      const generationMs = Date.now() - fetchStart;
      timer.start("claude_generation");
      timer.end("claude_generation");

      if (!res.ok) {
        const msg =
          bodyJson?.error?.message ?? `Claude API error (${res.status}).`;
        logAnalysisOperation("request_failed", meta, {
          attempt: opts.attemptNumber,
          durationMs: generationMs,
          status: res.status,
          error: bodyJson?.error?.type ?? "http_error",
        });
        if (res.status === 401 || res.status === 403) {
          throw new ConfigurationError(
            "Claude API credentials were rejected. Check CLAUDE_API_KEY."
          );
        }
        throw new AiServiceError(msg, bodyJson?.error);
      }

      const contentBlocks = bodyJson?.content ?? [];
      const textBlocks = contentBlocks.filter(
        (b): b is { type: string; text?: string } =>
          "type" in b && (b.type === "text" || b.type === "thinking")
      );

      // Only surface text responses; discard hidden thinking blocks.
      const content = textBlocks
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n");

      const promptTokens = bodyJson?.usage?.input_tokens;
      const completionTokens = bodyJson?.usage?.output_tokens;
      const totalTokens =
        promptTokens != null && completionTokens != null
          ? promptTokens + completionTokens
          : undefined;

      logAnalysisOperation("request_completed", meta, {
        attempt: opts.attemptNumber,
        durationMs: generationMs,
        promptTokens,
        completionTokens,
        totalTokens,
        responseLength: content.length,
        timeToFirstByteMs: ttfbOverride,
      });

      return {
        content,
        model: opts.model,
        tokenUsage: { promptTokens, completionTokens, totalTokens },
        // Expose measured TTFB so callers can report it even when they supplied a timer
        _timeToFirstByteMs: ttfbOverride,
        _generationMs: generationMs,
      };
    } catch (error) {
      if (
        error instanceof RateLimitError ||
        error instanceof TimeoutError ||
        error instanceof ConfigurationError ||
        error instanceof AiServiceError
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        logAnalysisOperation("timeout_error", meta, {
          attempt: opts.attemptNumber,
          durationMs: Date.now() - startTime,
        });
        throw new TimeoutError(
          "The Claude analysis request timed out. Please try again."
        );
      }
      logAnalysisOperation("request_failed", meta, {
        attempt: opts.attemptNumber,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};
