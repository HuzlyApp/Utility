import { describe, it, expect } from "vitest";
import { validateAndScore, summarizeMandatory, normalizeOutcome } from "@/lib/scoring";
import { makeAiResult, makeRequirement } from "./fixtures";

// §22/§23 — absence of evidence must never be a clear failure.

describe("requirement outcome normalization", () => {
  it("missing license (NOT_FOUND) reported as NOT_MET becomes VERIFY", () => {
    const r = makeRequirement({
      requirement: "Active Ohio or Compact RN license",
      status: "NOT_FOUND",
      requirement_outcome: "NOT_MET",
      candidate_evidence: "",
    });
    expect(normalizeOutcome(r)).toBe("VERIFY");
  });

  it("explicitly expired license (evidence present) stays NOT_MET", () => {
    const r = makeRequirement({
      requirement: "Active RN license",
      status: "CONFLICTING",
      requirement_outcome: "NOT_MET",
      candidate_evidence: "License expired March 2024",
    });
    // CONFLICTING maps to CONFLICT; explicit contradiction handled below.
    expect(normalizeOutcome(r)).toBe("CONFLICT");
  });

  it("explicitly insufficient experience (evidence present) stays NOT_MET", () => {
    const r = makeRequirement({
      requirement: "Two years recent RN experience",
      status: "PARTIAL",
      requirement_outcome: "NOT_MET",
      candidate_evidence: "Resume states 1 year of RN experience",
    });
    expect(normalizeOutcome(r)).toBe("NOT_MET");
  });

  it("NOT_MET with no evidence is downgraded to VERIFY", () => {
    const r = makeRequirement({
      status: "PARTIAL",
      requirement_outcome: "NOT_MET",
      candidate_evidence: "   ",
    });
    expect(normalizeOutcome(r)).toBe("VERIFY");
  });

  it("CONFIRMED maps to MET; PARTIAL maps to VERIFY", () => {
    expect(
      normalizeOutcome(makeRequirement({ status: "CONFIRMED", requirement_outcome: "MET" }))
    ).toBe("MET");
    expect(
      normalizeOutcome(
        makeRequirement({ status: "PARTIAL", requirement_outcome: "MET", candidate_evidence: "x" })
      )
    ).toBe("VERIFY");
  });
});

describe("category from normalized outcomes", () => {
  function withMandatory(reqs: ReturnType<typeof makeRequirement>[]) {
    return makeAiResult({
      mandatory_requirements: reqs,
      data_quality: {
        resume_completeness: "MODERATE",
        job_description_completeness: "MODERATE",
        job_description_conflicts: [],
        resume_conflicts: [],
        missing_information: [],
      },
    });
  }

  it("five missing mandatory items => NEEDS_MORE_INFORMATION, none not-met", () => {
    const reqs = Array.from({ length: 5 }, (_, i) =>
      makeRequirement({
        requirement: `Missing requirement ${i}`,
        status: "NOT_FOUND",
        requirement_outcome: "NOT_MET",
        candidate_evidence: "",
      })
    );
    const { result } = validateAndScore(withMandatory(reqs));
    const summary = summarizeMandatory(result.mandatory_requirements);
    expect(summary.not_met).toBe(0);
    expect(summary.to_verify).toBe(5);
    expect(summary.confirmed).toBe(0);
    expect(result.candidate_match.match_category).toBe("NEEDS_MORE_INFORMATION");
    expect(result.candidate_match.mandatory_requirement_override).toBe(false);
  });

  it("one explicitly contradicted mandatory item => NOT_CURRENTLY_SUBMITTABLE", () => {
    const reqs = [
      makeRequirement({
        requirement: "Two years RN experience",
        status: "PARTIAL",
        requirement_outcome: "NOT_MET",
        candidate_evidence: "Resume clearly states only 1 year of RN experience",
      }),
      makeRequirement({
        requirement: "BLS",
        status: "NOT_FOUND",
        requirement_outcome: "NOT_MET",
        candidate_evidence: "",
      }),
    ];
    const { result } = validateAndScore(withMandatory(reqs));
    const summary = summarizeMandatory(result.mandatory_requirements);
    expect(summary.not_met).toBe(1);
    expect(summary.to_verify).toBe(1);
    expect(result.candidate_match.match_category).toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(result.candidate_match.mandatory_requirement_override).toBe(true);
  });

  it("summary counts confirmed/verify/not_met correctly for a mix", () => {
    const reqs = [
      makeRequirement({ status: "CONFIRMED", requirement_outcome: "MET", candidate_evidence: "ARRT(CT) on resume" }),
      makeRequirement({ status: "NOT_FOUND", requirement_outcome: "NOT_MET", candidate_evidence: "" }),
      makeRequirement({ status: "PARTIAL", requirement_outcome: "NOT_MET", candidate_evidence: "1 year only" }),
    ];
    const { result } = validateAndScore(withMandatory(reqs));
    const summary = summarizeMandatory(result.mandatory_requirements);
    expect(summary.confirmed).toBe(1);
    expect(summary.to_verify).toBe(1);
    expect(summary.not_met).toBe(1);
  });
});
