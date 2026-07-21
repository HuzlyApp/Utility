import { describe, it, expect } from "vitest";
import { validateAndScore, summarizeMandatory } from "@/lib/scoring";
import { makeAiResult, makeRequirement } from "./fixtures";

describe("weighted scoring", () => {
  it("calculates the weighted total from subscores (test 29)", () => {
    const ai = makeAiResult({
      subscores: {
        mandatory_requirements_score: 100,
        specialty_experience_score: 100,
        clinical_skills_score: 100,
        licenses_certifications_score: 100,
        work_setting_equipment_score: 100,
        preferred_qualifications_score: 100,
      },
      mandatory_requirements: [
        makeRequirement({ status: "CONFIRMED", requirement_outcome: "MET" }),
      ],
    });
    const { result } = validateAndScore(ai);
    expect(result.candidate_match.recommended_overall_match_score).toBe(100);
    expect(result.candidate_match.match_category).toBe("STRONG_MATCH");
  });

  it("does not trust an inflated AI overall score", () => {
    const ai = makeAiResult({
      candidate_match: {
        ...makeAiResult().candidate_match,
        recommended_overall_match_score: 99,
      },
      subscores: {
        mandatory_requirements_score: 30,
        specialty_experience_score: 30,
        clinical_skills_score: 30,
        licenses_certifications_score: 30,
        work_setting_equipment_score: 30,
        preferred_qualifications_score: 30,
      },
      mandatory_requirements: [
        makeRequirement({ status: "NOT_FOUND", requirement_outcome: "VERIFY" }),
      ],
    });
    const { result, adjustments } = validateAndScore(ai);
    expect(result.candidate_match.recommended_overall_match_score).toBeLessThan(40);
    expect(adjustments.join(" ")).toContain("Overall score recalculated");
  });
});

describe("mandatory override logic", () => {
  it("forces NOT_CURRENTLY_SUBMITTABLE when a mandatory item is NOT_MET even with high score (test 27)", () => {
    const ai = makeAiResult({
      subscores: {
        mandatory_requirements_score: 100,
        specialty_experience_score: 100,
        clinical_skills_score: 100,
        licenses_certifications_score: 100,
        work_setting_equipment_score: 100,
        preferred_qualifications_score: 100,
      },
      mandatory_requirements: [
        makeRequirement({ status: "CONFIRMED", requirement_outcome: "MET" }),
        makeRequirement({
          requirement: "Active state license",
          status: "PARTIAL",
          requirement_outcome: "NOT_MET",
          candidate_evidence: "Résumé states the RN license expired in 2024",
        }),
      ],
    });
    const { result } = validateAndScore(ai);
    expect(result.candidate_match.match_category).toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(result.candidate_match.mandatory_requirement_override).toBe(true);
    expect(result.submission_readiness.readiness_status).toBe(
      "NOT_CURRENTLY_SUBMITTABLE"
    );
  });

  it("uses NEEDS_MORE_INFORMATION when resume completeness is LOW (test 28)", () => {
    const ai = makeAiResult({
      data_quality: {
        ...makeAiResult().data_quality,
        resume_completeness: "LOW",
      },
    });
    const { result } = validateAndScore(ai);
    expect(result.candidate_match.match_category).toBe("NEEDS_MORE_INFORMATION");
  });

  it("downgrades STRONG_MATCH to GOOD_MATCH when a mandatory item still needs verification", () => {
    const ai = makeAiResult({
      subscores: {
        mandatory_requirements_score: 100,
        specialty_experience_score: 100,
        clinical_skills_score: 100,
        licenses_certifications_score: 100,
        work_setting_equipment_score: 100,
        preferred_qualifications_score: 100,
      },
      mandatory_requirements: [
        makeRequirement({ status: "CONFIRMED", requirement_outcome: "MET" }),
        makeRequirement({
          requirement: "Siemens Force experience",
          status: "PARTIAL",
          requirement_outcome: "VERIFY",
        }),
      ],
    });
    const { result } = validateAndScore(ai);
    // mandatory subscore recomputed to (100+60)/2 = 80 -> overall < 90 anyway,
    // but even if score were high the category must not be STRONG_MATCH.
    expect(result.candidate_match.match_category).not.toBe("STRONG_MATCH");
  });

  it("does not disqualify on a single NOT_FOUND mandatory that is verifiable", () => {
    const ai = makeAiResult({
      mandatory_requirements: [
        makeRequirement({ status: "CONFIRMED", requirement_outcome: "MET" }),
        makeRequirement({
          requirement: "BLS current",
          status: "NOT_FOUND",
          requirement_outcome: "VERIFY",
        }),
      ],
    });
    const { result } = validateAndScore(ai);
    expect(result.candidate_match.match_category).not.toBe(
      "NOT_CURRENTLY_SUBMITTABLE"
    );
  });
});

describe("confidence + action clamping", () => {
  it("reduces confidence when conflicts exist", () => {
    const ai = makeAiResult({
      data_quality: {
        ...makeAiResult().data_quality,
        resume_conflicts: ["Two different end dates for the same role"],
      },
    });
    const { result } = validateAndScore(ai);
    expect(result.candidate_match.confidence_score).toBeLessThan(85);
  });

  it("clamps an over-optimistic action to the category", () => {
    const ai = makeAiResult({
      candidate_match: {
        ...makeAiResult().candidate_match,
        recommended_action: "PRIORITIZE_AND_CALL",
      },
      subscores: {
        mandatory_requirements_score: 30,
        specialty_experience_score: 30,
        clinical_skills_score: 30,
        licenses_certifications_score: 30,
        work_setting_equipment_score: 30,
        preferred_qualifications_score: 30,
      },
      mandatory_requirements: [
        makeRequirement({ status: "NOT_FOUND", requirement_outcome: "VERIFY" }),
      ],
    });
    const { result } = validateAndScore(ai);
    expect(result.candidate_match.recommended_action).not.toBe(
      "PRIORITIZE_AND_CALL"
    );
  });
});

describe("summarizeMandatory", () => {
  it("counts confirmed, to-verify, and not-met", () => {
    const summary = summarizeMandatory([
      makeRequirement({ requirement_outcome: "MET" }),
      makeRequirement({ requirement_outcome: "VERIFY" }),
      makeRequirement({ requirement_outcome: "CONFLICT" }),
      makeRequirement({ requirement_outcome: "NOT_MET" }),
    ]);
    expect(summary).toEqual({ confirmed: 1, to_verify: 2, not_met: 1 });
  });
});
