// Centralized environment/config access. Server-only values must never be
// imported into client components.

export const config = {
  xaiApiKey: process.env.XAI_API_KEY ?? "",
  grokBaseUrl: process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
  // Support both XAI_MODEL (preferred) and GROK_MODEL (legacy).
  // grok-4.5 with high reasoning is the consistency-first default.
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

  // Neon Auth (Managed Better Auth)
  neonAuthBaseUrl: process.env.NEON_AUTH_BASE_URL ?? process.env.AUTH_URL ?? "",
  neonAuthCookieSecret: process.env.NEON_AUTH_COOKIE_SECRET ?? "",

  // Image / OCR limits
  maxImageDimension: Number(process.env.MAX_IMAGE_DIMENSION ?? "10000"),
  ocrMinConfidence: Number(process.env.OCR_MIN_CONFIDENCE ?? "60"),
};

export const persistenceEnabled = () => Boolean(config.databaseUrl);
export const authConfigured = () =>
  Boolean(config.neonAuthBaseUrl && config.neonAuthCookieSecret);
