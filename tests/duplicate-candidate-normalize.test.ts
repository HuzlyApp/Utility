import { describe, it, expect } from "vitest";
import {
  normalizeCandidateName,
  normalizeEmail,
  normalizePhone,
  isCheckableCandidateName,
} from "@/lib/duplicate-candidate/normalize";

describe("normalizeCandidateName", () => {
  it("matches exact duplicate name", () => {
    expect(normalizeCandidateName("John Smith")).toBe("john smith");
    expect(normalizeCandidateName("John Smith")).toBe(
      normalizeCandidateName("John Smith")
    );
  });

  it("matches names with different capitalization", () => {
    expect(normalizeCandidateName("JOHN SMITH")).toBe("john smith");
    expect(normalizeCandidateName("john smith")).toBe("john smith");
  });

  it("matches names with punctuation differences", () => {
    expect(normalizeCandidateName("John A. Smith")).toBe("john a smith");
    expect(normalizeCandidateName("John A Smith")).toBe("john a smith");
  });

  it("matches names with middle initial differences", () => {
    expect(normalizeCandidateName("John A. Smith")).toBe(
      normalizeCandidateName("john a smith")
    );
    expect(normalizeCandidateName("John  A   Smith")).toBe("john a smith");
  });

  it("does not match different names", () => {
    expect(normalizeCandidateName("John Smith")).not.toBe(
      normalizeCandidateName("Jane Smith")
    );
  });

  it("trims and collapses spaces", () => {
    expect(normalizeCandidateName("  John   Smith  ")).toBe("john smith");
  });
});

describe("normalizeEmail", () => {
  it("normalizes email for comparison", () => {
    expect(normalizeEmail("  John@Example.COM ")).toBe("john@example.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("normalizes phone digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("isCheckableCandidateName", () => {
  it("rejects placeholder names", () => {
    expect(isCheckableCandidateName("Unnamed candidate")).toBe(false);
    expect(isCheckableCandidateName("Pasted candidate")).toBe(false);
    expect(isCheckableCandidateName("")).toBe(false);
  });

  it("accepts real names", () => {
    expect(isCheckableCandidateName("John Smith")).toBe(true);
  });
});
