import { config } from "@/lib/config";
import {
  AI_MODEL_OPTIONS,
  DEFAULT_AI_MODEL_OPTION,
  isAiModelOptionId,
  isAiProvider,
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
 * Defaults to Grok 4.5 for backward compatibility with existing clients.
 */
export function resolveAiSelection(
  body?: ClientAiSelectionBody | null
): AiSelection {
  const optionRaw = body?.ai_model_option;
  if (isAiModelOptionId(optionRaw)) {
    return selectionFromOptionId(optionRaw, body?.ai_model);
  }

  const providerRaw = body?.ai_provider;
  if (isAiProvider(providerRaw)) {
    const optionId =
      providerRaw === "claude" ? "claude" : DEFAULT_AI_MODEL_OPTION;
    return {
      provider: providerRaw,
      model: concreteModel(providerRaw, body?.ai_model),
      optionId,
    };
  }

  return selectionFromOptionId(DEFAULT_AI_MODEL_OPTION, body?.ai_model);
}

export function selectionFromOptionId(
  optionId: AiModelOptionId,
  modelOverride?: unknown
): AiSelection {
  const option =
    AI_MODEL_OPTIONS.find((o) => o.id === optionId) ?? AI_MODEL_OPTIONS[0];
  return {
    provider: option.provider,
    model: concreteModel(option.provider, modelOverride),
    optionId: option.id,
  };
}

function concreteModel(provider: AiProvider, override?: unknown): string {
  if (typeof override === "string" && override.trim()) {
    return override.trim();
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
      available: Boolean(config.xaiApiKey),
      message: config.xaiApiKey
        ? undefined
        : "Grok 4.5 is not configured on the server.",
    },
    claude: {
      available: Boolean(config.claudeApiKey),
      message: config.claudeApiKey
        ? undefined
        : "Claude is not configured on the server.",
    },
  };
}
