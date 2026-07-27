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
 * Claude is the only active analysis provider.
 */
export function resolveAiSelection(
  body?: ClientAiSelectionBody | null
): AiSelection {
  const optionRaw = body?.ai_model_option;
  if (isAiModelOptionId(optionRaw)) {
    return selectionFromOptionId(optionRaw, body?.ai_model);
  }

  // Unknown option ids / providers fall through to Claude.
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
    return model;
  }
  return config.claudeModel;
}

/** Public, non-secret availability flags for the UI. */
export function getProviderAvailability(): Record<
  string,
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
