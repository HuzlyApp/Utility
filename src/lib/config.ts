// Centralized environment/config access. Server-only values must never be
// imported into client components.

export const config = {
  xaiApiKey: process.env.XAI_API_KEY ?? "",
  grokBaseUrl: process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
  // Support both XAI_MODEL (preferred) and GROK_MODEL (legacy)
  xaiModel: process.env.XAI_MODEL ?? process.env.GROK_MODEL ?? "grok-4-fast",
  databaseUrl: process.env.DATABASE_URL ?? "",
  recentExperienceMonths: Number(process.env.RECENT_EXPERIENCE_MONTHS ?? "24"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? "10") * 1024 * 1024,
  // Grok API timeout in milliseconds (default 60s)
  xaiTimeoutMs: Number(process.env.XAI_TIMEOUT_MS ?? "60000"),
  // Maximum retries for temporary failures
  xaiMaxRetries: Number(process.env.XAI_MAX_RETRIES ?? "1"),
};

export const persistenceEnabled = () => Boolean(config.databaseUrl);
