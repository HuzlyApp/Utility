import { describe, it, expect } from "vitest";
import { parseAiResult } from "@/lib/schema";
import { makeAiResult } from "./fixtures";

describe("AI response schema validation", () => {
  it("accepts a valid result", () => {
    const raw = JSON.stringify(makeAiResult());
    const parsed = parseAiResult(raw);
    expect(parsed.ok).toBe(true);
  });

  it("strips markdown code fences before parsing (test 36 support)", () => {
    const raw = "```json\n" + JSON.stringify(makeAiResult()) + "\n```";
    const parsed = parseAiResult(raw);
    expect(parsed.ok).toBe(true);
  });

  it("rejects an invalid match category (test 37)", () => {
    const bad = makeAiResult();
    // @ts-expect-error intentionally invalid
    bad.candidate_match.match_category = "SUPER_MATCH";
    const parsed = parseAiResult(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
  });

  it("rejects an invalid recommended action (test 38)", () => {
    const bad = makeAiResult();
    // @ts-expect-error intentionally invalid
    bad.candidate_match.recommended_action = "HIRE_NOW";
    const parsed = parseAiResult(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
  });

  it("rejects a missing required field (test 39)", () => {
    const bad = makeAiResult() as Record<string, unknown>;
    delete bad.submission_readiness;
    const parsed = parseAiResult(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
  });

  it("rejects a score outside 0-100 (test 40)", () => {
    const bad = makeAiResult();
    bad.candidate_match.recommended_overall_match_score = 140;
    const parsed = parseAiResult(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
  });

  it("rejects a CONFIRMED requirement with no evidence (test 37)", () => {
    const bad = makeAiResult();
    bad.mandatory_requirements = [
      {
        requirement: "ARRT(CT)",
        requirement_type: "MANDATORY",
        status: "CONFIRMED",
        requirement_outcome: "MET",
        candidate_evidence: "",
        evidence_source: "RESUME",
        impact: "Meets requirement",
        verification_required: false,
        confidence: 90,
      },
    ];
    const parsed = parseAiResult(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
  });

  it("rejects non-JSON text", () => {
    const parsed = parseAiResult("not json at all");
    expect(parsed.ok).toBe(false);
  });
});
