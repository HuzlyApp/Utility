import { describe, it, expect, beforeEach } from "vitest";
import {
  issueDuplicateConfirmationToken,
  verifyDuplicateConfirmationToken,
  consumeDuplicateConfirmationToken,
  resetDuplicateConfirmationTokensForTests,
} from "@/lib/duplicate-candidate/confirmation-token";

const baseParams = {
  userId: "user-1",
  tenantId: "tenant-a",
  candidateId: "candidate-new",
  normalizedName: "john smith",
  matchedCandidateIds: ["candidate-old"],
  matchedAnalysisIds: ["analysis-1"],
  confidence: "POSSIBLE" as const,
};

describe("duplicate confirmation token", () => {
  beforeEach(() => {
    resetDuplicateConfirmationTokensForTests();
  });

  it("issues and verifies a valid token", () => {
    const token = issueDuplicateConfirmationToken(baseParams);
    const result = verifyDuplicateConfirmationToken(token, baseParams);
    expect(result.ok).toBe(true);
  });

  it("cannot be reused after consumption", () => {
    const token = issueDuplicateConfirmationToken(baseParams);
    const first = verifyDuplicateConfirmationToken(token, baseParams);
    expect(first.ok).toBe(true);
    if (first.ok) {
      consumeDuplicateConfirmationToken(first.payload.jti, first.payload.exp);
    }
    const second = verifyDuplicateConfirmationToken(token, baseParams);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("TOKEN_ALREADY_USED");
  });

  it("cannot be used by another recruiter", () => {
    const token = issueDuplicateConfirmationToken(baseParams);
    const result = verifyDuplicateConfirmationToken(token, {
      ...baseParams,
      userId: "user-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("USER_MISMATCH");
  });

  it("cannot cross tenants", () => {
    const token = issueDuplicateConfirmationToken(baseParams);
    const result = verifyDuplicateConfirmationToken(token, {
      ...baseParams,
      tenantId: "tenant-b",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TENANT_MISMATCH");
  });

  it("cannot be used for a different candidate", () => {
    const token = issueDuplicateConfirmationToken(baseParams);
    const result = verifyDuplicateConfirmationToken(token, {
      ...baseParams,
      candidateId: "other-candidate",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("CANDIDATE_MISMATCH");
  });

  it("rejects when match set changes", () => {
    const token = issueDuplicateConfirmationToken(baseParams);
    const result = verifyDuplicateConfirmationToken(token, {
      ...baseParams,
      matchedCandidateIds: ["candidate-old", "candidate-other"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MATCHES_CHANGED");
  });
});
