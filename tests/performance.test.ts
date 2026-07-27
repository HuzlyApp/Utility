import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AnalysisPerformanceTracker,
  logPerformanceMetrics,
  categorizeValidationError,
  type PerformanceMetrics,
} from "@/lib/ai/performance";

describe("AnalysisPerformanceTracker", () => {
  let tracker: AnalysisPerformanceTracker;

  beforeEach(() => {
    tracker = new AnalysisPerformanceTracker("claude", "claude-sonnet-4-5-20250929", "test-analysis-123");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tracks prompt build timing", () => {
    tracker.markPromptBuilt(4200, 6900);
    
    const metrics = tracker.getMetrics();
    expect(metrics.stages.promptBuildMs).toBeGreaterThanOrEqual(0);
    expect(metrics.jobChars).toBe(4200);
    expect(metrics.resumeChars).toBe(6900);
  });

  it("tracks Claude request timing", () => {
    tracker.markPromptBuilt(1000, 1000);
    
    tracker.markClaudeRequestStarted();
    tracker.markClaudeFirstToken();
    tracker.markClaudeComplete(3100, 2400);
    
    const metrics = tracker.getMetrics();
    // Verify structure rather than exact timing since timers vary
    expect(metrics.stages.claudeTimeToFirstTokenMs).toBeGreaterThanOrEqual(0);
    expect(metrics.stages.claudeGenerationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.inputTokens).toBe(3100);
    expect(metrics.outputTokens).toBe(2400);
  });

  it("tracks validation and repair timing", () => {
    tracker.markPromptBuilt(1000, 1000);
    tracker.markClaudeRequestStarted();
    tracker.markClaudeFirstToken();
    tracker.markClaudeComplete();
    
    tracker.markJsonParsed();
    tracker.markValidated();
    
    tracker.markRepairStarted();
    tracker.markRepairComplete(true);
    
    const metrics = tracker.getMetrics();
    expect(metrics.stages.jsonParseMs).toBeGreaterThanOrEqual(0);
    expect(metrics.stages.validationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.stages.repairRetryMs).toBeGreaterThanOrEqual(0);
    expect(metrics.repairAttempted).toBe(true);
    expect(metrics.repairSucceeded).toBe(true);
  });

  it("calculates total duration", () => {
    tracker.markPromptBuilt(1000, 1000);
    tracker.markClaudeRequestStarted();
    tracker.markClaudeComplete();
    tracker.markJsonParsed();
    tracker.markValidated();
    
    const metrics = tracker.getMetrics();
    expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("tracks validation error categories", () => {
    tracker.setValidationErrorCategory("missing_confirmed_evidence");
    const metrics = tracker.getMetrics();
    expect(metrics.validationErrorCategory).toBe("missing_confirmed_evidence");
  });

  it("handles repair failure correctly", () => {
    tracker.markRepairComplete(false);
    const metrics = tracker.getMetrics();
    expect(metrics.repairAttempted).toBe(true);
    expect(metrics.repairSucceeded).toBe(false);
  });
});

describe("categorizeValidationError", () => {
  it("categorizes missing required field errors", () => {
    expect(categorizeValidationError("Required field missing")).toBe("missing_required_field");
  });

  it("categorizes enum value errors", () => {
    expect(categorizeValidationError("Invalid enum value")).toBe("invalid_enum_value");
  });

  it("categorizes missing confirmed evidence errors", () => {
    expect(categorizeValidationError("A CONFIRMED requirement must include candidate_evidence"))
      .toBe("missing_confirmed_evidence");
  });

  it("categorizes JSON parse errors", () => {
    expect(categorizeValidationError("Unexpected token in JSON")).toBe("invalid_json");
  });

  it("returns unknown for unrecognized errors", () => {
    expect(categorizeValidationError("Something went wrong")).toBe("unknown_validation_error");
  });
});

describe("logPerformanceMetrics", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("logs metrics without PII", () => {
    const metrics: PerformanceMetrics = {
      analysisId: "test-123",
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      totalDurationMs: 78000,
      stages: {
        promptBuildMs: 20,
        claudeTimeToFirstTokenMs: 4500,
        claudeGenerationMs: 68000,
        jsonParseMs: 15,
        validationMs: 35,
        repairRetryMs: 0,
        scoringMs: 10,
        persistenceMs: 900,
        clientRenderMs: 120,
      },
      jobChars: 4200,
      resumeChars: 6900,
      inputTokens: 3100,
      outputTokens: 2400,
      repairAttempted: false,
      repairSucceeded: false,
    };

    logPerformanceMetrics(metrics);

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logCall = consoleSpy.mock.calls[0][0];
    
    // Verify it contains the performance event marker
    expect(logCall).toContain("candidate_match_analysis_performance");
    
    // Parse the JSON portion
    const jsonStr = consoleSpy.mock.calls[0][1];
    const logged = JSON.parse(jsonStr as string);
    
    expect(logged.event).toBe("candidate_match_analysis_performance");
    expect(logged.analysis_id).toBe("test-123");
    expect(logged.provider).toBe("claude");
    expect(logged.total_duration_ms).toBe(78000);
    expect(logged.stages.prompt_build_ms).toBe(20);
    expect(logged.stages.claude_time_to_first_token_ms).toBe(4500);
    expect(logged.job_chars).toBe(4200);
    expect(logged.resume_chars).toBe(6900);
    expect(logged.input_tokens).toBe(3100);
    expect(logged.output_tokens).toBe(2400);
    expect(logged.repair_attempted).toBe(false);
    
    // Ensure no PII is logged
    expect(jsonStr).not.toContain("resume text content");
    expect(jsonStr).not.toContain("job description");
  });
});
