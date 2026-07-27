import { describe, it, expect } from "vitest";
import {
  matchedSecondaryIdentifiers,
  resolveDuplicateConfidence,
} from "@/lib/duplicate-candidate/classify";

describe("duplicate classification", () => {
  it("classifies same name only as POSSIBLE", () => {
    const matches = [
      {
        candidate_id: "c2",
        analysis_id: "a1",
        job_title: "RN",
        created_at: "2026-01-01",
        match_category: "GOOD_MATCH",
        disposition: null,
        matched_identifiers: [] as string[],
      },
    ];
    expect(resolveDuplicateConfidence(matches)).toBe("POSSIBLE");
  });

  it("classifies same name and same email as HIGH", () => {
    const ids = matchedSecondaryIdentifiers(
      {
        candidate_id: "c1",
        email: "john@example.com",
        phone: null,
        resume_hash: null,
      },
      {
        candidate_id: "c2",
        email: "john@example.com",
        phone: null,
        resume_hash: null,
      }
    );
    expect(ids).toContain("email");

    const matches = [
      {
        candidate_id: "c2",
        analysis_id: "a1",
        job_title: "RN",
        created_at: "2026-01-01",
        match_category: "GOOD_MATCH",
        disposition: null,
        matched_identifiers: ids,
      },
    ];
    expect(resolveDuplicateConfidence(matches)).toBe("HIGH");
  });

  it("classifies same name and same phone as HIGH", () => {
    const ids = matchedSecondaryIdentifiers(
      {
        candidate_id: "c1",
        email: null,
        phone: "5551234567",
        resume_hash: null,
      },
      {
        candidate_id: "c2",
        email: null,
        phone: "(555) 123-4567",
        resume_hash: null,
      }
    );
    expect(ids).toContain("phone");
  });

  it("classifies same name and same resume hash as HIGH", () => {
    const ids = matchedSecondaryIdentifiers(
      {
        candidate_id: "c1",
        email: null,
        phone: null,
        resume_hash: "abc123",
      },
      {
        candidate_id: "c2",
        email: null,
        phone: null,
        resume_hash: "abc123",
      }
    );
    expect(ids).toContain("resume_hash");
  });

  it("treats same name but different email as POSSIBLE", () => {
    const ids = matchedSecondaryIdentifiers(
      {
        candidate_id: "c1",
        email: "john@example.com",
        phone: null,
        resume_hash: null,
      },
      {
        candidate_id: "c2",
        email: "jane@example.com",
        phone: null,
        resume_hash: null,
      }
    );
    expect(ids).toHaveLength(0);
  });
});
