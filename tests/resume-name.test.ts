import { describe, expect, it } from "vitest";
import { detectCandidateNameFromResumeText, namesMatch } from "@/lib/resume-name";

describe("detectCandidateNameFromResumeText", () => {
  it("detects a name from top resume lines", () => {
    const text = `JANE DOE
Registered Nurse
jane@example.com
`;
    expect(detectCandidateNameFromResumeText(text)).toBe("Jane Doe");
  });

  it("returns null when text starts with section headers", () => {
    const text = `RESUME
SUMMARY
Experienced nurse with 8+ years in med-surg.
`;
    expect(detectCandidateNameFromResumeText(text)).toBeNull();
  });
});

describe("namesMatch", () => {
  it("matches names with spacing/case differences", () => {
    expect(namesMatch("Jane   Doe", "jane doe")).toBe(true);
  });

  it("does not match different names", () => {
    expect(namesMatch("Jane Doe", "John Doe")).toBe(false);
  });
});
