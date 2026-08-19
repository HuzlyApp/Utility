import { describe, expect, it } from "vitest";
import {
  detectTags,
  experienceBucket,
  extractYearsExperience,
  isImportCandidateUuid,
  jobProfileFromWorkspace,
  matchBand,
  phrasePresent,
  scoreCandidateAgainstJob,
  splitRequirementList,
} from "@/lib/candidate-import-match";

const JOB = jobProfileFromWorkspace({
  job_title: "Senior Product Manager",
  specialty: "Product Management",
  department: "Product",
  location: "Plano, TX",
  job_description_text:
    "Own the roadmap for a B2B SaaS platform. Drive Agile delivery, stakeholder management, and analytics.",
  structured_requirements: {
    mandatory_requirements: "Product strategy\nRoadmapping\nAgile\nStakeholder management",
    preferred_requirements: "Analytics\nHealthcare",
    required_certifications: "PMP",
    minimum_years_experience: "8",
    education_requirements: "Bachelor's degree",
  },
});

describe("import candidate matching", () => {
  it("builds a job profile from title, description, and structured requirements", () => {
    expect(JOB.title).toBe("Senior Product Manager");
    expect(JOB.requiredSkills).toEqual(
      expect.arrayContaining(["Product strategy", "Roadmapping", "Agile"])
    );
    expect(JOB.minYears).toBe(8);
    expect(JOB.tags).toEqual(
      expect.arrayContaining(["Product Management", "SaaS", "B2B", "Agile"])
    );
  });

  it("scores a close product-management résumé highly with match reasons", () => {
    const match = scoreCandidateAgainstJob(JOB, {
      fullName: "Sarah Johnson",
      specialty: "Product Management",
      location: "Plano, TX",
      currentRole: "Senior Product Manager",
      resumeText:
        "Senior Product Manager with 12 years product management in B2B SaaS. Roadmapping, Agile, stakeholder management, analytics, product strategy. PMP certified. Bachelor's degree.",
    });

    expect(match.score).toBeGreaterThanOrEqual(80);
    expect(["excellent", "strong"]).toContain(match.band);
    expect(match.yearsExperience).toBe(12);
    expect(match.reasons.some((r) => /required skills matched/i.test(r))).toBe(true);
    expect(match.reasons.some((r) => /12 years/i.test(r))).toBe(true);
    expect(match.matchedSkills.length).toBeGreaterThan(0);
  });

  it("scores an unrelated candidate much lower", () => {
    const match = scoreCandidateAgainstJob(JOB, {
      fullName: "Alex Cook",
      specialty: "Line Cook",
      location: "Boston, MA",
      currentRole: "Line Cook",
      resumeText: "Five years preparing meals in a restaurant kitchen. Food safety certified.",
    });
    expect(match.score).toBeLessThan(60);
    expect(matchBand(match.score)).toBe("low");
  });

  it("detects skills, years, tags, and phrase presence", () => {
    expect(phrasePresent("agile scrum roadmapping", "Roadmapping")).toBe(true);
    expect(extractYearsExperience("Over 10 years product management")).toBe(10);
    expect(experienceBucket(12)).toBe("10plus");
    expect(detectTags("remote senior saas fintech leadership")).toEqual(
      expect.arrayContaining(["SaaS", "FinTech", "Leadership", "Remote", "Senior"])
    );
    expect(splitRequirementList("ICU\nTelemetry; BLS, ACLS")).toEqual(
      expect.arrayContaining(["ICU", "Telemetry", "BLS", "ACLS"])
    );
  });

  it("identifies candidates by database UUID only", () => {
    expect(isImportCandidateUuid("1234")).toBe(false);
    expect(isImportCandidateUuid("John Smith")).toBe(false);
    expect(isImportCandidateUuid("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(true);
  });
});
