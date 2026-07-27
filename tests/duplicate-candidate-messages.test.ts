import { describe, it, expect } from "vitest";
import {
  duplicateWarningMessage,
  isDuplicateConfirmationRequired,
} from "@/lib/duplicate-candidate/messages";

describe("duplicate warning messages", () => {
  it("shows possible duplicate message", () => {
    const msg = duplicateWarningMessage("John Smith", "POSSIBLE");
    expect(msg).toContain("John Smith");
    expect(msg).toContain("Do you still want to continue?");
    expect(msg).toContain("different person");
  });

  it("shows high confidence message", () => {
    const msg = duplicateWarningMessage("John Smith", "HIGH");
    expect(msg).toContain("likely duplicate");
    expect(msg).toContain("create another analysis");
  });
});

describe("isDuplicateConfirmationRequired", () => {
  it("detects duplicate confirmation response", () => {
    expect(
      isDuplicateConfirmationRequired({
        status: "DUPLICATE_CONFIRMATION_REQUIRED",
        candidate_name: "John Smith",
        duplicate_confidence: "POSSIBLE",
        matches: [],
        duplicate_confirmation_token: "tok",
      })
    ).toBe(true);
  });

  it("returns false for unrelated responses", () => {
    expect(isDuplicateConfirmationRequired({ success: false, error: "nope" })).toBe(
      false
    );
  });
});
