import { describe, it, expect } from "vitest";
import { sanitizeResumeText } from "@/lib/sanitize";

describe("PII sanitization", () => {
  it("removes SSN, DOB, and photo references (test 33 support)", () => {
    const input =
      "John Doe\nDate of Birth: 01/02/1980\nSSN: 123-45-6789\nPhoto: attached\nCT Technologist at Mercy Hospital";
    const { text, removed } = sanitizeResumeText(input);
    expect(text).not.toContain("123-45-6789");
    expect(text).not.toContain("01/02/1980");
    expect(removed).toContain("ssn");
    expect(removed).toContain("date of birth");
    // Job-relevant content is preserved.
    expect(text).toContain("CT Technologist at Mercy Hospital");
  });

  it("leaves clean résumé text unchanged", () => {
    const input = "CT Technologist with ARRT(CT). Worked at 3 hospitals.";
    const { text, removed } = sanitizeResumeText(input);
    expect(text).toBe(input);
    expect(removed).toHaveLength(0);
  });
});
