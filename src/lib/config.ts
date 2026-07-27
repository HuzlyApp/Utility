// Centralized environment/config access. Server-only values must never be
// imported into client components.

export const config = {
  // Grok/XAI configuration (retained for legacy records, not used for new analysis)
  xaiApiKey: process.env.XAI_API_KEY ?? "",
  grokBaseUrl: process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
  // Support both XAI_MODEL (preferred) and GROK_MODEL (legacy).
  xaiModel: process.env.XAI_MODEL ?? process.env.GROK_MODEL ?? "grok-4.5",
  // Vision-capable model used only as a controlled OCR fallback (spec §9).
  xaiVisionModel:
    process.env.XAI_VISION_MODEL ?? process.env.XAI_MODEL ?? "grok-4.5",
  // Reasoning depth for grok-4.5: low | medium | high (default high).
  xaiReasoningEffort: (process.env.XAI_REASONING_EFFORT ?? "high") as
    | "low"
    | "medium"
    | "high",
  // Sampling temperature. Keep at 0 for deterministic match scoring.
  xaiTemperature: Number(process.env.XAI_TEMPERATURE ?? "0"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  recentExperienceMonths: Number(process.env.RECENT_EXPERIENCE_MONTHS ?? "24"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? "10") * 1024 * 1024,
  // Reasoning models need a longer window than fast chat defaults.
  xaiTimeoutMs: Number(process.env.XAI_TIMEOUT_MS ?? "180000"),
  // Maximum retries for temporary failures
  xaiMaxRetries: Number(process.env.XAI_MAX_RETRIES ?? "1"),

  // Claude / Anthropic (server-only; never expose to the client)
  claudeApiKey: process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "",
  claudeModel:
    process.env.CLAUDE_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-5-20250929",
  claudeTimeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS ?? "180000"),
  // Optimized max_tokens: 4096 is sufficient for the analysis schema
  // Previously was 8192 which caused longer generation times
  claudeMaxTokens: Number(process.env.CLAUDE_MAX_TOKENS ?? "4096"),
  claudeTemperature: Number(process.env.CLAUDE_TEMPERATURE ?? "0"),
  // Enable extended thinking for complex cases (default: false for speed)
  claudeExtendedThinking: process.env.CLAUDE_EXTENDED_THINKING === "true",
  claudeThinkingBudget: Number(process.env.CLAUDE_THINKING_BUDGET ?? "0"),

  // Neon Auth (Managed Better Auth)
  neonAuthBaseUrl: process.env.NEON_AUTH_BASE_URL ?? process.env.AUTH_URL ?? "",
  neonAuthCookieSecret: process.env.NEON_AUTH_COOKIE_SECRET ?? "",
  neonAuthCookieDomain: process.env.NEON_AUTH_COOKIE_DOMAIN ?? "",
  neonAuthSessionDataTtlSeconds: Number(
    process.env.NEON_AUTH_SESSION_DATA_TTL_SECONDS ?? "604800"
  ),

  // Image / OCR limits
  maxImageDimension: Number(process.env.MAX_IMAGE_DIMENSION ?? "10000"),
  ocrMinConfidence: Number(process.env.OCR_MIN_CONFIDENCE ?? "60"),
  
  // Performance / caching options
  jobCacheEnabled: process.env.JOB_CACHE_ENABLED !== "false", // default true
  jobCacheTtlDays: Number(process.env.JOB_CACHE_TTL_DAYS ?? "30"),
  // Structured output beta flag (disabled by default)
  claudeStructuredOutput: process.env.CLAUDE_STRUCTURED_OUTPUT === "true",
};

export const persistenceEnabled = () => Boolean(config.databaseUrl);
export const authConfigured = () =>
  Boolean(config.neonAuthBaseUrl && config.neonAuthCookieSecret);

/** Get effective max_tokens based on use case */
export function getClaudeMaxTokens(useCase: "standard" | "complex" = "standard"): number {
  if (useCase === "complex" && config.claudeExtendedThinking) {
    // For complex cases with extended thinking, allow more tokens
    return Math.max(config.claudeMaxTokens, 8192);
  }
  return config.claudeMaxTokens;
}
