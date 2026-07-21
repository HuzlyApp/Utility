// Centralized environment/config access. Server-only values must never be
// imported into client components.

export const config = {
  xaiApiKey: process.env.XAI_API_KEY ?? "",
  grokBaseUrl: process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
  // Support both XAI_MODEL (preferred) and GROK_MODEL (legacy)
  xaiModel: process.env.XAI_MODEL ?? process.env.GROK_MODEL ?? "grok-4-fast",
  // Vision-capable model used only as a controlled OCR fallback (spec §9).
  xaiVisionModel:
    process.env.XAI_VISION_MODEL ?? process.env.XAI_MODEL ?? "grok-4",
  databaseUrl: process.env.DATABASE_URL ?? "",
  recentExperienceMonths: Number(process.env.RECENT_EXPERIENCE_MONTHS ?? "24"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? "10") * 1024 * 1024,
  // Grok API timeout in milliseconds (default 60s)
  xaiTimeoutMs: Number(process.env.XAI_TIMEOUT_MS ?? "60000"),
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
