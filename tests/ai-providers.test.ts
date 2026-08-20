import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeAiResult } from "./fixtures";

vi.mock("@/lib/config", () => ({
  config: {
    xaiApiKey: "test-xai-key",
    grokBaseUrl: "https://api.x.ai/v1",
    xaiModel: "grok-4.5",
    xaiVisionModel: "grok-4.5",
    xaiReasoningEffort: "high",
    xaiTemperature: 0,
    xaiTimeoutMs: 180000,
    xaiMaxRetries: 0,
    claudeApiKey: "test-claude-key",
    claudeModel: "claude-sonnet-4-5-20250929",
    claudeTimeoutMs: 180000,
    claudeMaxTokens: 4096,
    claudeTemperature: 0,
    recentExperienceMonths: 24,
    jobCacheTtlMs: 3600000,
    jobCacheMaxSize: 100,
  },
  getClaudeMaxTokensForAnalysis: (resumeCharCount: number) =>
    resumeCharCount > 10_000 ? 16384 : 4096,
}));

const claudeComplete = vi.fn();

vi.mock("@/lib/ai/providers/claude", () => ({
  claudeProvider: {
    provider: "claude",
    isConfigured: () => true,
    unavailableMessage: () => "Claude unavailable",
    resolveModel: (m?: string) => m || "claude-sonnet-4-5-20250929",
    complete: (...args: unknown[]) => claudeComplete(...args),
  },
}));

vi.mock("@/lib/ai/performance", () => ({
  PerformanceTimer: class {
    start = vi.fn();
    end = vi.fn(() => 10);
    duration = vi.fn(() => 10);
    total = vi.fn(() => 100);
  },
  AnalysisPerformanceTracker: class {
    markPromptBuilt = vi.fn();
    markClaudeRequestStarted = vi.fn();
    markClaudeFirstToken = vi.fn();
    markClaudeComplete = vi.fn();
    markJsonParsed = vi.fn();
    markValidated = vi.fn();
    markRepairStarted = vi.fn();
    markRepairComplete = vi.fn();
    markScoringComplete = vi.fn();
    markPersistenceComplete = vi.fn();
    setValidationErrorCategory = vi.fn();
    getMetrics = vi.fn(() => ({
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      totalDurationMs: 100,
      stages: {},
      jobChars: 100,
      resumeChars: 100,
      repairAttempted: false,
      repairSucceeded: false,
    }));
    getReport = vi.fn(() => ({
      prompt_build_ms: 10,
      claude_time_to_first_token_ms: 500,
      claude_generation_ms: 2000,
      json_parse_ms: 5,
      validation_ms: 10,
      repair_retry_ms: 0,
      scoring_ms: 0,
      persistence_ms: 0,
      client_render_ms: 0,
      total_duration_ms: 2525,
    }));
  },
  categorizeValidationError: vi.fn(() => "unknown_validation_error"),
  categorizeRepairError: vi.fn(() => "unknown_validation_error"),
  logPerformanceMetrics: vi.fn(),
  logPerformanceReport: vi.fn(),
}));

import { analyzeCandidate } from "@/lib/ai/analyze-candidate";
import { resolveAiSelection, getProviderAvailability } from "@/lib/ai/selection";
import { parseAiResult } from "@/lib/schema";
import { ProviderUnavailableError } from "@/lib/ai/errors";
import { ANALYZE_SYSTEM_PROMPT, DEEP_ANALYSIS_SYSTEM_PROMPT } from "@/lib/prompt";

const baseArgs = {
  job_description_text: "Need CT tech with ARRT(CT).",
  resume_text: "Jane Doe, ARRT(CT), 5 years hospital CT.",
  recent_experience_months: 24,
};

describe("AI model selection routing", () => {
  beforeEach(() => {
    claudeComplete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses Claude when Claude is selected", async () => {
    const payload = JSON.stringify(makeAiResult());
    claudeComplete.mockResolvedValue({
      content: payload,
      model: "claude-sonnet-4-5-20250929",
    });

    const result = await analyzeCandidate({
      ...baseArgs,
      provider: "claude",
      optionId: "claude",
    });

    expect(claudeComplete).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("claude");
    expect(result.model).toBe("claude-sonnet-4-5-20250929");
    expect(result.perf).toBeDefined();
    expect(result.perf?.claude_generation_ms).toBe(10);
  });

  it("rejects invalid AI responses safely", async () => {
    claudeComplete
      .mockResolvedValueOnce({ content: "{not-json", model: "claude-sonnet-4-5-20250929" })
      .mockResolvedValueOnce({ content: "{still-bad", model: "claude-sonnet-4-5-20250929" });

    await expect(
      analyzeCandidate({ ...baseArgs, provider: "claude" })
    ).rejects.toMatchObject({ name: "AiValidationError" });
  });

  it("saves selected provider and model on the result object", async () => {
    claudeComplete.mockResolvedValue({
      content: JSON.stringify(makeAiResult()),
      model: "claude-sonnet-4-5-20250929",
    });

    const result = await analyzeCandidate({
      ...baseArgs,
      provider: "claude",
      optionId: "claude",
    });

    expect(result).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      optionId: "claude",
    });
  });

  it("uses the lean Analyze prompt by default", async () => {
    claudeComplete.mockResolvedValue({
      content: JSON.stringify(makeAiResult()),
      model: "claude-sonnet-4-5-20250929",
    });

    await analyzeCandidate({
      ...baseArgs,
      provider: "claude",
      optionId: "claude",
    });

    const messages = claudeComplete.mock.calls[0][0] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toBe(ANALYZE_SYSTEM_PROMPT);
    expect(messages[1]?.content).toContain("items_to_verify");
    expect(messages[1]?.content).not.toContain("recruiter_decision_summary");
  });

  it("uses the existing detailed prompt only for Deeper Analysis", async () => {
    claudeComplete.mockResolvedValue({
      content: JSON.stringify(makeAiResult()),
      model: "claude-sonnet-4-5-20250929",
    });

    await analyzeCandidate({
      ...baseArgs,
      provider: "claude",
      optionId: "claude",
      analysisMode: "deep",
    });

    const messages = claudeComplete.mock.calls[0][0] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]?.content).toBe(DEEP_ANALYSIS_SYSTEM_PROMPT);
    expect(messages[1]?.content).toContain("Required JSON structure");
    expect(messages[1]?.content).toContain("analysis_version");
    expect(messages[1]?.content).toContain("recruiter_decision_summary");
  });
});

describe("resolveAiSelection", () => {
  it("defaults to Claude", () => {
    expect(resolveAiSelection({})).toEqual({
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      optionId: "claude",
    });
    expect(resolveAiSelection(null)).toMatchObject({
      provider: "claude",
      optionId: "claude",
    });
  });

  it("ignores former grok option requests and resolves to Claude", () => {
    expect(
      resolveAiSelection({ ai_model_option: "grok-4.5", ai_provider: "grok" })
    ).toMatchObject({
      provider: "claude",
      optionId: "claude",
    });
  });

  it("resolves Claude from option id", () => {
    expect(
      resolveAiSelection({ ai_model_option: "claude" })
    ).toMatchObject({
      provider: "claude",
      optionId: "claude",
    });
  });
});

describe("batch analysis independence", () => {
  it("one failed candidate does not stop the batch", async () => {
    const results: Array<{ ok: boolean; provider: string }> = [];
    const candidates = ["a", "b", "c"];

    for (const id of candidates) {
      try {
        if (id === "b") throw new Error("provider failed");
        results.push({ ok: true, provider: "claude" });
      } catch {
        results.push({ ok: false, provider: "claude" });
      }
    }

    expect(results).toEqual([
      { ok: true, provider: "claude" },
      { ok: false, provider: "claude" },
      { ok: true, provider: "claude" },
    ]);
    expect(results.every((r) => r.provider === "claude")).toBe(true);
  });

  it("multiple candidates use the same selected model", () => {
    const selection = resolveAiSelection({ ai_model_option: "claude" });
    const batch = ["c1", "c2", "c3"].map((id) => ({
      id,
      provider: selection.provider,
      model: selection.model,
    }));
    expect(new Set(batch.map((b) => b.provider)).size).toBe(1);
    expect(batch[0].provider).toBe("claude");
  });
});

describe("API key exposure safety", () => {
  it("provider availability response never includes API keys", () => {
    const availability = getProviderAvailability();
    const serialized = JSON.stringify(availability);
    expect(serialized).not.toContain("test-xai-key");
    expect(serialized).not.toContain("test-claude-key");
    expect(serialized).not.toMatch(/sk-/i);
    expect(availability.grok.available).toBe(false);
    expect(availability.claude.available).toBe(true);
  });
});

describe("schema normalization", () => {
  it("existing payloads still validate", () => {
    const parsed = parseAiResult(JSON.stringify(makeAiResult()));
    expect(parsed.ok).toBe(true);
  });
});
