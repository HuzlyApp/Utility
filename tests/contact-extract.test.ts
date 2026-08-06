import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACT_EXTRACTION_MAX_ATTEMPTS,
  CONTACT_EXTRACTION_POLL_MAX_MS,
  CONTACT_EXTRACTION_POLL_MS,
  CONTACT_EXTRACTION_STALE_MS,
  canOverwriteContactWithResume,
  canRetryContactExtraction,
  displayContactValue,
  extractContactsFromResumeText,
  hasContactDetails,
  isContactExtractionInFlight,
  isContactExtractionStale,
  normalizeContactExtractionStatus,
} from "@/lib/contact-extract";
import { toStatusHistory } from "@/lib/candidate-crm";
import { canViewCandidateContact } from "@/lib/auth/rbac";

const SAMPLE_RESUME = `
Saharshini Eppakayalla
Senior Python Software Engineer
Email: saharshini.e@gmail.com
Phone: (555) 123-4567
Location: Austin, TX

Experience
Built distributed systems at Acme.
`;

describe("resume contact extraction", () => {
  it("extracts email and phone from resume text", () => {
    const result = extractContactsFromResumeText(SAMPLE_RESUME);
    expect(result.status).toBe("completed");
    expect(result.email?.toLowerCase()).toBe("saharshini.e@gmail.com");
    expect(result.emailNormalized).toBe("saharshini.e@gmail.com");
    expect(result.phoneNormalized).toBe("5551234567");
    expect(result.phone).toContain("555");
    expect(hasContactDetails(result)).toBe(true);
  });

  it("ignores recruiter/template emails when a personal email exists", () => {
    const result = extractContactsFromResumeText(`
Jane Candidate
jane.candidate@gmail.com
Also contact careers@acme.com or noreply@portal.com
Phone +1 415-555-0199
`);
    expect(result.email?.toLowerCase()).toBe("jane.candidate@gmail.com");
  });

  it("returns not_found when no reliable contact exists", () => {
    const result = extractContactsFromResumeText(`
Resume summary only.
Worked on project code 162212 in 2024.
`);
    expect(result.status).toBe("not_found");
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(hasContactDetails(result)).toBe(false);
  });

  it("does not treat short numeric IDs as phone numbers", () => {
    const result = extractContactsFromResumeText(`
Candidate Name
Job ID 162212
ZIP 78701
Started 2020
`);
    expect(result.phone).toBeNull();
  });

  it("protects manually corrected contact values from overwrite", () => {
    expect(canOverwriteContactWithResume("MANUAL")).toBe(false);
    expect(canOverwriteContactWithResume("MANUAL_CORRECTED")).toBe(false);
    expect(canOverwriteContactWithResume("RESUME")).toBe(true);
    expect(canOverwriteContactWithResume(null)).toBe(true);
    expect(canOverwriteContactWithResume("MANUAL", true)).toBe(true);
  });

  it("normalizes legacy extraction statuses", () => {
    expect(normalizeContactExtractionStatus("NOT_PROCESSED")).toBe("pending");
    expect(normalizeContactExtractionStatus("EXTRACTED")).toBe("completed");
    expect(normalizeContactExtractionStatus("FAILED")).toBe("failed");
    expect(normalizeContactExtractionStatus("NOT_FOUND")).toBe("not_found");
  });

  it("shows Extracting… only while in-flight, Not found / dash otherwise", () => {
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "pending",
        canViewContact: true,
      })
    ).toBe("Extracting…");
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "processing",
        canViewContact: true,
        startedAt: new Date().toISOString(),
      })
    ).toBe("Extracting…");
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "not_found",
        canViewContact: true,
      })
    ).toBe("Not found");
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "completed",
        canViewContact: true,
      })
    ).toBe("—");
    expect(
      displayContactValue({
        value: "a@b.com",
        extractionStatus: "completed",
        canViewContact: false,
      })
    ).toBe("Restricted");
  });

  it("marks stale processing jobs and allows retry under attempt cap", () => {
    const started = new Date(Date.now() - CONTACT_EXTRACTION_STALE_MS - 1_000).toISOString();
    expect(isContactExtractionStale("processing", started)).toBe(true);
    expect(isContactExtractionInFlight("processing", started)).toBe(false);
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "processing",
        canViewContact: true,
        startedAt: started,
      })
    ).toBe("Did not complete");
    expect(
      canRetryContactExtraction({
        status: "failed",
        attempts: 1,
      })
    ).toBe(true);
    expect(
      canRetryContactExtraction({
        status: "processing",
        attempts: 2,
        startedAt: started,
      })
    ).toBe(true);
    expect(
      canRetryContactExtraction({
        status: "failed",
        attempts: CONTACT_EXTRACTION_MAX_ATTEMPTS,
      })
    ).toBe(false);
  });

  it("shows one extracted field and a missing placeholder for the other", () => {
    expect(
      displayContactValue({
        value: "candidate@example.com",
        extractionStatus: "completed",
        canViewContact: true,
      })
    ).toBe("candidate@example.com");
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "completed",
        canViewContact: true,
      })
    ).toBe("—");
  });
});

describe("status history + workspace UI contracts", () => {
  it("orders status history newest first with notes and actors", () => {
    const history = toStatusHistory([
      {
        id: "1",
        action_type: "STATUS_CHANGED",
        previous_value: "New / Not Contacted",
        new_value: "Phone Screen",
        performer_name: "Jane Recruiter",
        metadata: { note: "Candidate confirmed availability for Monday." },
        created_at: "2026-08-06T14:35:00.000Z",
      },
      {
        id: "2",
        action_type: "NOTE_ADDED",
        previous_value: null,
        new_value: "x",
        performer_name: "Jane Recruiter",
        metadata: {},
        created_at: "2026-08-06T13:00:00.000Z",
      },
      {
        id: "3",
        action_type: "STATUS_CHANGED",
        previous_value: null,
        new_value: "New / Not Contacted",
        performer_name: "System",
        metadata: {},
        created_at: "2026-08-06T12:00:00.000Z",
      },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0].newStatus).toBe("Phone Screen");
    expect(history[0].note).toContain("Monday");
    expect(history[0].updatedBy).toBe("Jane Recruiter");
    expect(history[1].id).toBe("3");
  });

  it("wires extraction lifecycle, polling, retry, and job code independence", () => {
    const select = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "candidate",
        "candidate-status-select.tsx"
      ),
      "utf8"
    );
    const modal = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "candidate",
        "candidate-status-modal.tsx"
      ),
      "utf8"
    );
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "candidates.ts"),
      "utf8"
    );
    const upload = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "workspaces",
        "[workspaceId]",
        "candidates",
        "route.ts"
      ),
      "utf8"
    );
    const table = readFileSync(
      join(process.cwd(), "src", "components", "workspace", "ranking-table.tsx"),
      "utf8"
    );
    const cell = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "workspace",
        "candidate-identity-cell.tsx"
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

    expect(select).toContain("View status history");
    expect(select).toContain('openModal("history")');
    expect(modal).toContain("Update Status");
    expect(modal).toContain("Status History");
    expect(modal).toContain("No status changes have been recorded yet.");
    expect(modal).toContain("/api/candidates/${candidateId}/activity");
    expect(dal).toContain("applyResumeContactExtraction");
    expect(dal).toContain("finalizeStaleContactExtractions");
    expect(dal).toContain("resolvePendingContactExtractions");
    expect(dal).toContain('contact_extraction_status = ${"processing"}');
    expect(dal).toContain('contact_extraction_status = ${"failed"}');
    expect(dal).toContain('contact_extraction_status = ${"not_found"}');
    expect(dal).toContain("w.job_ref AS job_code");
    expect(dal).toContain("contact_extraction_started_at");
    expect(upload).toContain("applyResumeContactExtraction");
    expect(upload).toContain("contact_extraction_status: contact.status");
    expect(table).toContain("CONTACT_EXTRACTION_POLL_MS");
    expect(table).toContain("isContactExtractionInFlight");
    expect(table).toContain("retryContactExtraction");
    expect(table).toContain("CONTACT_EXTRACTION_POLL_MAX_MS");
    expect(cell).toContain("Retry extraction");
    expect(cell).toContain("Contact extraction failed");
    expect(cell).toContain("Contact extraction did not complete");
    expect(reextract).toContain("canRetryContactExtraction");
    expect(reextract).toContain('contact_extraction_status = ${"pending"}');
    expect(canViewCandidateContact("VIEWER")).toBe(false);
    expect(CONTACT_EXTRACTION_POLL_MS).toBeGreaterThanOrEqual(2_000);
    expect(CONTACT_EXTRACTION_POLL_MAX_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("ships contact extraction schema migration with lifecycle columns", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "contact-extract-schema.sql"),
      "utf8"
    );
    expect(sql).toContain("email_source");
    expect(sql).toContain("phone_source");
    expect(sql).toContain("contact_extraction_status");
    expect(sql).toContain("contact_extraction_started_at");
    expect(sql).toContain("contact_extraction_completed_at");
    expect(sql).toContain("contact_extraction_error");
    expect(sql).toContain("contact_extraction_attempts");
    expect(sql).toContain("DEFAULT 'pending'");
  });
});
