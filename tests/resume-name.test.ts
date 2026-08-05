import { describe, expect, it } from "vitest";
import {
  detectCandidateNameFromResumeText,
  displayCandidateName,
  namesMatch,
} from "@/lib/resume-name";

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

describe("displayCandidateName", () => {
  it("strips a leading Resume prefix case-insensitively", () => {
    expect(displayCandidateName("ResumeDavidKago")).toBe("DavidKago");
    expect(displayCandidateName("ResumeLindaCorbell")).toBe("LindaCorbell");
    expect(displayCandidateName("RESUMEjaneDoe")).toBe("janeDoe");
    expect(displayCandidateName("resume Smith")).toBe("Smith");
  });

  it("leaves names without the prefix unchanged", () => {
    expect(displayCandidateName("DavidKago")).toBe("DavidKago");
    expect(displayCandidateName("Jane Resume")).toBe("Jane Resume");
  });

  it("falls back for empty or null names", () => {
    expect(displayCandidateName(null)).toBe("Unnamed candidate");
    expect(displayCandidateName("")).toBe("Unnamed candidate");
    expect(displayCandidateName("Resume")).toBe("Resume");
  });
});
