import { config } from "@/lib/config";
import {
  DEFAULT_AI_MODEL_OPTION,
  isAiModelOptionId,
  type AiModelOptionId,
  type AiProvider,
  type AiSelection,
} from "./types";

export interface ClientAiSelectionBody {
  ai_provider?: unknown;
  ai_model?: unknown;
  ai_model_option?: unknown;
}

/**
 * Resolve the provider/model selection from a request body.
 * Grok analysis is disabled — always resolves to Claude.
 */
export function resolveAiSelection(
  body?: ClientAiSelectionBody | null
): AiSelection {
  const optionRaw = body?.ai_model_option;
  if (isAiModelOptionId(optionRaw)) {
    return selectionFromOptionId(optionRaw, body?.ai_model);
  }

  // Explicit Grok requests are remapped to Claude (provider disabled).
  // Unknown option ids / providers also fall through to Claude.
  return selectionFromOptionId(DEFAULT_AI_MODEL_OPTION, body?.ai_model);
}

export function selectionFromOptionId(
  optionId: AiModelOptionId,
  modelOverride?: unknown
): AiSelection {
  return {
    provider: "claude",
    model: concreteModel("claude", modelOverride),
    optionId,
  };
}

function concreteModel(provider: AiProvider, override?: unknown): string {
  if (typeof override === "string" && override.trim()) {
    const model = override.trim();
    // Ignore former Grok model overrides — analysis is Claude-only.
    if (provider === "claude" && /grok/i.test(model)) {
      return config.claudeModel;
    }
    return model;
  }
  return provider === "claude" ? config.claudeModel : config.xaiModel;
}

/** Public, non-secret availability flags for the UI. */
export function getProviderAvailability(): Record<
  AiProvider,
  { available: boolean; message?: string }
> {
  return {
    grok: {
      available: false,
      message: "Grok analysis is disabled. Use Claude.",
    },
    claude: {
      available: Boolean(config.claudeApiKey),
      message: config.claudeApiKey
        ? undefined
        : "Claude is not configured on the server.",
    },
  };
}
