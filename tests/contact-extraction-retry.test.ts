import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getContactFieldUiState,
  hasCompleteContactDetails,
  needsContactExtractionRetry,
} from "@/lib/contact-extract";

describe("contact extraction retry contracts", () => {
  it("exposes retry endpoint that reloads résumé files", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "candidates",
        "[candidateId]",
        "contact-extraction",
        "retry",
        "route.ts"
      ),
      "utf8"
    );
    const reextract = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "candidates",
        "[candidateId]",
        "reextract-contact",
        "route.ts"
      ),
      "utf8"
    );
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "candidates.ts"),
      "utf8"
    );
    const list = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "candidate-list.tsx"),
      "utf8"
    );

    expect(route).toContain("reextractPost");
    expect(reextract).toContain("retryCandidateContactExtraction");
    expect(dal).toContain("getCandidateResumeFilesWithBytes");
    expect(dal).toContain("extractFromUpload");
    expect(dal).toContain("healFalseFailedContactExtractions");
    expect(dal).toContain("retryFailedContactExtractionsBatch");
    expect(list).toContain("/api/candidates/${candidateId}/contact-extraction/retry");
    expect(list).toContain("aria-label={`Retry contact extraction for");
    expect(list).toContain("cursor-pointer");
    expect(list).toContain("Retry failed contact extraction");
  });

  it("never shows failed retry UI when both contacts already exist", () => {
    expect(
      hasCompleteContactDetails({
        email: "peterhuang7291@gmail.com",
        phone: "+1 (718) 683-8956",
      })
    ).toBe(true);
    expect(
      needsContactExtractionRetry({
        email: "peterhuang7291@gmail.com",
        phone: "+1 (718) 683-8956",
        status: "failed",
        attempts: 2,
      })
    ).toBe(false);
    expect(
      getContactFieldUiState({
        value: "peterhuang7291@gmail.com",
        extractionStatus: "failed",
        canViewContact: true,
      }).kind
    ).toBe("value");
  });

  it("shows retryable field state only for missing values after failure", () => {
    const phone = getContactFieldUiState({
      value: "+1 (718) 683-8956",
      extractionStatus: "failed",
      canViewContact: true,
      attempts: 1,
      field: "phone",
    });
    const email = getContactFieldUiState({
      value: null,
      extractionStatus: "failed",
      canViewContact: true,
      attempts: 1,
      field: "email",
    });
    expect(phone.kind).toBe("value");
    expect(email).toMatchObject({
      kind: "retryable",
      label: "Failed",
      canRetry: true,
    });
  });
});
