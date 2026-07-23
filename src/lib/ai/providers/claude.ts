import { config } from "@/lib/config";
import {
  ConfigurationError,
  RateLimitError,
  TimeoutError,
  AiServiceError,
} from "../errors";
import { logAnalysisOperation } from "../log";
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

  async complete(messages, opts): Promise<ProviderCallResult> {
    if (!config.claudeApiKey) {
      throw new ConfigurationError(
        "CLAUDE_API_KEY is not configured on the server."
      );
    }

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

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.claudeApiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: config.claudeMaxTokens,
          temperature: config.claudeTemperature,
          system,
          messages: anthropicMessages,
        }),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startTime;

      if (res.status === 429) {
        logAnalysisOperation("rate_limit_error", meta, {
          attempt: opts.attemptNumber,
          durationMs,
        });
        throw new RateLimitError(
          "Claude rate limit exceeded. Please try again later."
        );
      }

      if (res.status === 408 || res.status === 504) {
        logAnalysisOperation("timeout_error", meta, {
          attempt: opts.attemptNumber,
          durationMs,
        });
        throw new TimeoutError(
          "The Claude analysis request timed out. Please try again."
        );
      }

      const body = (await res.json().catch(() => null)) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string; type?: string };
      } | null;

      if (!res.ok) {
        const msg =
          body?.error?.message ??
          `Claude API error (${res.status}).`;
        logAnalysisOperation("request_failed", meta, {
          attempt: opts.attemptNumber,
          durationMs,
          status: res.status,
          error: body?.error?.type ?? "http_error",
        });
        if (res.status === 401 || res.status === 403) {
          throw new ConfigurationError(
            "Claude API credentials were rejected. Check CLAUDE_API_KEY."
          );
        }
        throw new AiServiceError(msg, body?.error);
      }

      const content =
        body?.content
          ?.filter((b) => b.type === "text" && b.text)
          .map((b) => b.text!)
          .join("\n") ?? "";

      const promptTokens = body?.usage?.input_tokens;
      const completionTokens = body?.usage?.output_tokens;
      const totalTokens =
        promptTokens != null && completionTokens != null
          ? promptTokens + completionTokens
          : undefined;

      logAnalysisOperation("request_completed", meta, {
        attempt: opts.attemptNumber,
        durationMs,
        promptTokens,
        completionTokens,
        totalTokens,
        responseLength: content.length,
      });

      return {
        content,
        model: opts.model,
        tokenUsage: { promptTokens, completionTokens, totalTokens },
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
