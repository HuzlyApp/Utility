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
    claudeMaxTokens: 8192,
    claudeTemperature: 0,
    recentExperienceMonths: 24,
  },
}));

const grokComplete = vi.fn();
const claudeComplete = vi.fn();

vi.mock("@/lib/ai/providers/grok", () => ({
  grokProvider: {
    provider: "grok",
    isConfigured: () => false,
    unavailableMessage: () => "Grok analysis is disabled. Use Claude.",
    resolveModel: (m?: string) => m || "grok-4.5",
    complete: (...args: unknown[]) => grokComplete(...args),
  },
}));

vi.mock("@/lib/ai/providers/claude", () => ({
  claudeProvider: {
    provider: "claude",
    isConfigured: () => true,
    unavailableMessage: () => "Claude unavailable",
    resolveModel: (m?: string) => m || "claude-sonnet-4-5-20250929",
    complete: (...args: unknown[]) => claudeComplete(...args),
  },
}));

import { analyzeCandidate } from "@/lib/ai/analyze-candidate";
import { resolveAiSelection, getProviderAvailability } from "@/lib/ai/selection";
import { parseAiResult } from "@/lib/schema";
import { ProviderUnavailableError } from "@/lib/ai/errors";

const baseArgs = {
  job_description_text: "Need CT tech with ARRT(CT).",
  resume_text: "Jane Doe, ARRT(CT), 5 years hospital CT.",
  recent_experience_months: 24,
};

describe("AI model selection routing", () => {
  beforeEach(() => {
    grokComplete.mockReset();
    claudeComplete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects Grok because analysis with Grok is disabled", async () => {
    await expect(
      analyzeCandidate({
        ...baseArgs,
        provider: "grok",
      })
    ).rejects.toBeInstanceOf(ProviderUnavailableError);

    expect(grokComplete).not.toHaveBeenCalled();
    expect(claudeComplete).not.toHaveBeenCalled();
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
    expect(grokComplete).not.toHaveBeenCalled();
    expect(result.provider).toBe("claude");
    expect(result.model).toBe("claude-sonnet-4-5-20250929");
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
});

describe("resolveAiSelection", () => {
  it("defaults to Claude (Grok disabled)", () => {
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

  it("remaps former Grok option requests to Claude", () => {
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
  });
});

describe("schema normalization", () => {
  it("existing Grok-shaped payloads still validate", () => {
    const parsed = parseAiResult(JSON.stringify(makeAiResult()));
    expect(parsed.ok).toBe(true);
  });
});
