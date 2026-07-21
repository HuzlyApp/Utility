import OpenAI from "openai";
import { config } from "./config";
import { parseAiResult, type AiResult } from "./schema";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  buildRepairPrompt,
  type UserPromptArgs,
} from "./prompt";

// Grok is accessed through its OpenAI-compatible endpoint.
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

export interface AnalyzeAiResult {
  aiResult: AiResult;
  rawResponse: string;
  repaired: boolean;
  model: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AnalysisMetadata {
  analysisId?: string;
  tenantId?: string;
  userId?: string;
  inputCharCount: number;
  resumeCharCount: number;
  jobCharCount: number;
}

// Safe logging - never logs resume/job content
function logAnalysisOperation(
  operation: string,
  meta: AnalysisMetadata,
  details?: Record<string, unknown>
) {
  // eslint-disable-next-line no-console
  console.log(
    `[grok-analysis] ${operation}`,
    JSON.stringify({
      analysisId: meta.analysisId,
      tenantId: meta.tenantId,
      userId: meta.userId,
      inputChars: meta.inputCharCount,
      resumeChars: meta.resumeCharCount,
      jobChars: meta.jobCharCount,
      ...details,
    })
  );
}

async function callModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  meta: AnalysisMetadata,
  attemptNumber: number
): Promise<{ content: string; tokenUsage?: AnalyzeAiResult["tokenUsage"] }> {
  const startTime = Date.now();
  
  try {
    const completion = await getClient().chat.completions.create({
      model: config.xaiModel,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const duration = Date.now() - startTime;
    const content = completion.choices[0]?.message?.content ?? "";
    
    logAnalysisOperation("request_completed", meta, {
      attempt: attemptNumber,
      durationMs: duration,
      model: config.xaiModel,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      responseLength: content.length,
    });

    return {
      content,
      tokenUsage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Check for rate limiting
    if (error instanceof OpenAI.APIError && error.status === 429) {
      logAnalysisOperation("rate_limit_error", meta, {
        attempt: attemptNumber,
        durationMs: duration,
        error: "rate_limit_exceeded",
      });
      throw new RateLimitError("xAI rate limit exceeded. Please try again later.");
    }

    // Check for timeout
    if (error instanceof OpenAI.APIError && error.status === 408) {
      logAnalysisOperation("timeout_error", meta, {
        attempt: attemptNumber,
        durationMs: duration,
        error: "request_timeout",
      });
      throw new TimeoutError("The analysis request timed out. Please try again.");
    }

    logAnalysisOperation("request_failed", meta, {
      attempt: attemptNumber,
      durationMs: duration,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw error;
  }
}

/**
 * Runs the analysis against Grok, validates the JSON against the strict schema,
 * and retries exactly once with a repair prompt if validation fails.
 * Throws on unrecoverable failure (caller maps this to a user-friendly error).
 */
export async function runAnalysis(
  args: UserPromptArgs,
  meta?: Partial<AnalysisMetadata>
): Promise<AnalyzeAiResult> {
  const analysisMeta: AnalysisMetadata = {
    analysisId: meta?.analysisId,
    tenantId: meta?.tenantId,
    userId: meta?.userId,
    inputCharCount: args.job_description_text.length + args.resume_text.length,
    resumeCharCount: args.resume_text.length,
    jobCharCount: args.job_description_text.length,
  };

  logAnalysisOperation("analysis_started", analysisMeta, {
    model: config.xaiModel,
  });

  const userPrompt = buildUserPrompt(args);
  
  try {
    const firstResponse = await callModel(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      analysisMeta,
      1
    );

    const firstRaw = firstResponse.content;

    // Check for empty response
    if (!firstRaw || firstRaw.trim().length === 0) {
      logAnalysisOperation("empty_response", analysisMeta, { attempt: 1 });
      throw new EmptyResponseError("Grok returned an empty response.");
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
        model: config.xaiModel,
        tokenUsage: firstResponse.tokenUsage,
      };
    }

    logAnalysisOperation("validation_failed", analysisMeta, {
      attempt: 1,
      error: firstParsed.error,
    });

    // Retry once with a JSON-repair prompt.
    const repairResponse = await callModel(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
        { role: "assistant", content: firstRaw },
        { role: "user", content: buildRepairPrompt(firstRaw, firstParsed.error) },
      ],
      analysisMeta,
      2
    );

    const repairRaw = repairResponse.content;

    // Check for empty repair response
    if (!repairRaw || repairRaw.trim().length === 0) {
      logAnalysisOperation("empty_response", analysisMeta, { attempt: 2 });
      throw new EmptyResponseError("Grok returned an empty response on retry.");
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
        model: config.xaiModel,
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
    // Re-throw known error types
    if (
      error instanceof AiValidationError ||
      error instanceof RateLimitError ||
      error instanceof TimeoutError ||
      error instanceof EmptyResponseError ||
      error instanceof ConfigurationError
    ) {
      throw error;
    }
    
    // Wrap unknown errors
    logAnalysisOperation("unexpected_error", analysisMeta, {
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new AiServiceError(
      "An unexpected error occurred during analysis.",
      error
    );
  }
}

// Custom error classes for specific error types
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class EmptyResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyResponseError";
  }
}

export class AiServiceError extends Error {
  originalError: unknown;
  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = "AiServiceError";
    this.originalError = originalError;
  }
}

export class AiValidationError extends Error {
  details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.name = "AiValidationError";
    this.details = details;
  }
}
