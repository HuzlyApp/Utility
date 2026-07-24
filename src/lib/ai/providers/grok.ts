import { config } from "@/lib/config";
import { ConfigurationError } from "../errors";
import type {
  ProviderAdapter,
  ProviderCallResult,
} from "../types";

/**
 * Grok analysis provider — disabled.
 * Kept so historical `ai_provider = grok` records and the provider map remain valid.
 * Vision/OCR may still use xAI separately via `src/lib/files.ts`.
 */
export const grokProvider: ProviderAdapter = {
  provider: "grok",

  isConfigured() {
    return false;
  },

  unavailableMessage() {
    return "Grok analysis is disabled. Use Claude.";
  },

  resolveModel(requested?: string) {
    return requested?.trim() || config.xaiModel;
  },

  async complete(): Promise<ProviderCallResult> {
    throw new ConfigurationError("Grok analysis is disabled. Use Claude.");
  },
};
