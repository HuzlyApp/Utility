import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isContactExtractionInFlight,
  normalizeContactExtractionStatus,
} from "@/lib/contact-extract";

describe("candidates page background contact extraction", () => {
  it("exposes list + run APIs and does not block SSR list on extraction", () => {
    const page = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "candidates", "page.tsx"),
      "utf8"
    );
    const listApi = readFileSync(
      join(process.cwd(), "src", "app", "api", "candidates", "route.ts"),
      "utf8"
    );
    const runApi = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "candidates",
        "contact-extraction",
        "run",
        "route.ts"
      ),
      "utf8"
    );
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "candidates.ts"),
      "utf8"
    );
    const listUi = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "candidate-list.tsx"),
      "utf8"
    );

    expect(page).toContain("listDashboardCandidates");
    expect(page).not.toContain("processEligibleContactExtractions");
    expect(listApi).toContain("listDashboardCandidates");
    expect(listApi).toContain('url.searchParams.get("search")');
    expect(runApi).toContain("processEligibleContactExtractions");
    expect(runApi).toContain("candidateIds");
    expect(dal).toContain("processEligibleContactExtractions");
    expect(dal).toContain('contact_extraction_status = ${"queued"}');
    expect(dal).toContain("CONTACT_EXTRACTION_MAX_ATTEMPTS");
    expect(dal).toContain("c.contact_extraction_status");
    expect(listUi).toContain("/api/candidates/contact-extraction/run");
    expect(listUi).toContain("CONTACT_EXTRACTION_POLL_MS");
    expect(listUi).toContain("isContactExtractionInFlight");
    expect(listUi).toContain("displayContactValue");
    expect(listUi).toContain("Extraction failed");
    expect(listUi).toContain("Retry");
  });

  it("treats queued as in-flight and maps stale to failed", () => {
    expect(normalizeContactExtractionStatus("queued")).toBe("queued");
    expect(normalizeContactExtractionStatus("stale")).toBe("failed");
    expect(isContactExtractionInFlight("queued", null)).toBe(true);
    expect(isContactExtractionInFlight("completed", null)).toBe(false);
  });

  it("skips completed and not_found candidates in eligibility SQL", () => {
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "candidates.ts"),
      "utf8"
    );
    expect(dal).toContain("'completed', 'not_found', 'extracted'");
    expect(dal).toContain("extracted_resume_text");
  });
});
