import { describe, it, expect } from "vitest";
import { validateAndScore } from "@/lib/scoring";
import { makeAiResult, makeRequirement } from "./fixtures";
import { sanitizeResumeText } from "@/lib/sanitize";

describe("fairness requirements (spec section 12)", () => {
  it("candidate name does not affect score (test 31)", () => {
    // The scoring algorithm should only consider evidence status, not content
    const ai1 = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "2 years CT experience",
          candidate_evidence: "John Smith worked at Hospital A",
          status: "CONFIRMED",
          requirement_outcome: "MET",
        }),
      ],
    });

    const ai2 = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "2 years CT experience",
          candidate_evidence: "Maria Garcia worked at Hospital B",
          status: "CONFIRMED",
          requirement_outcome: "MET",
        }),
      ],
    });

    const result1 = validateAndScore(ai1);
    const result2 = validateAndScore(ai2);

    // Both should get the same score regardless of name
    expect(result1.result.candidate_match.recommended_overall_match_score).toBe(
      result2.result.candidate_match.recommended_overall_match_score
    );
  });

  it("graduation year is not used to infer age (test 32)", () => {
    const ai = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "BS in Radiologic Technology",
          candidate_evidence: "Graduated 1995 from State University",
          status: "CONFIRMED",
          requirement_outcome: "MET",
        }),
      ],
    });

    const { result, adjustments } = validateAndScore(ai);
    // Should not trigger any age-related penalties or warnings
    const score = result.candidate_match.recommended_overall_match_score;
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThan(0);
    
    // Check that no age-related adjustments were made
    const ageRelatedAdjustments = adjustments.filter(a => 
      /age|graduation|year/i.test(a)
    );
    expect(ageRelatedAdjustments).toHaveLength(0);
  });

  it("photograph references are ignored (test 33)", () => {
    const input = "Candidate Photo: attached.jpg\nCT Technologist with ARRT certification";
    const { text, removed } = sanitizeResumeText(input);

    expect(removed).toContain("photo reference");
    expect(text).not.toContain("attached.jpg");
    expect(text).toContain("CT Technologist");
  });

  it("employment gaps are not penalized unless recency is explicitly required (test 34)", () => {
    // Candidate with a gap but still meets the experience requirement
    const ai = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "2 years CT experience",
          candidate_evidence: "Worked 2018-2020, 2022-2024 at Mercy Hospital",
          status: "CONFIRMED",
          requirement_outcome: "MET",
        }),
      ],
      experience_analysis: {
        total_professional_experience_years: 4,
        relevant_specialty_experience_years: 4,
        recent_relevant_experience_years: 2,
        travel_experience_confirmed: false,
        required_work_setting_experience_confirmed: false,
        is_estimated: false,
        experience_calculation_notes: ["Gap between 2020-2022 not in healthcare"],
      },
    });

    const { result } = validateAndScore(ai);
    // Should not be downgraded due to the gap
    expect(result.candidate_match.match_category).not.toBe("NOT_A_MATCH");
  });

  it("resume formatting does not affect score (test 35)", () => {
    // Same qualifications, different formatting evidence
    const wellFormatted = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "ARRT(CT) certification",
          candidate_evidence: "ARRT(CT) - Active - Expires 2026",
          status: "CONFIRMED",
          requirement_outcome: "MET",
        }),
      ],
    });

    const poorlyFormatted = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "ARRT(CT) certification",
          candidate_evidence: "cert: arrt ct expires next year",
          status: "CONFIRMED",
          requirement_outcome: "MET",
        }),
      ],
    });

    const result1 = validateAndScore(wellFormatted);
    const result2 = validateAndScore(poorlyFormatted);

    // Scoring should be based on evidence status, not formatting
    expect(result1.result.subscores.mandatory_requirements_score).toBe(
      result2.result.subscores.mandatory_requirements_score
    );
  });
});

describe("protected characteristics are not considered", () => {
  it("does not score based on address/location beyond job relevance", () => {
    const ai = makeAiResult({
      mandatory_requirements: [
        makeRequirement({
          requirement: "Texas state license",
          candidate_evidence: "Address: 123 Main St, Austin, TX 78701",
          status: "NOT_FOUND", // License not confirmed, just address
          requirement_outcome: "VERIFY",
        }),
      ],
    });

    const { result } = validateAndScore(ai);
    // Should require verification of license, not assume from address
    expect(result.mandatory_requirements[0].requirement_outcome).toBe("VERIFY");
  });

  it("sanitizes marital status from resume", () => {
    const input = "Marital Status: Single\nCT Technologist with 3 years experience";
    const { text, removed } = sanitizeResumeText(input);

    expect(removed).toContain("marital status");
    expect(text).not.toContain("Single");
    expect(text).toContain("CT Technologist");
  });

  it("sanitizes explicit age information", () => {
    const input = "Age: 34\nRegistered Radiologic Technologist";
    const { text, removed } = sanitizeResumeText(input);

    expect(removed).toContain("age");
    expect(text).not.toContain("34");
  });
});
