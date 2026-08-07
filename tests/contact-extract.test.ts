import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACT_EXTRACTION_MAX_ATTEMPTS,
  CONTACT_EXTRACTION_POLL_MAX_MS,
  CONTACT_EXTRACTION_POLL_MS,
  CONTACT_EXTRACTION_STALE_MS,
  buildContactExtractionApiSummary,
  canAutoRetryContactExtraction,
  canOverwriteContactWithResume,
  canRetryContactExtraction,
  displayContactValue,
  extractContactsFromResumeText,
  getContactFieldUiState,
  hasContactDetails,
  isContactExtractionInFlight,
  isContactExtractionStale,
  isCorruptEmailValue,
  isCorruptPhoneValue,
  isValidEmail,
  isValidPhone,
  needsContactExtractionRetry,
  normalizeContactExtractionStatus,
  normalizeResumeTextForContactExtraction,
  sanitizeEmailCandidate,
} from "@/lib/contact-extract";
import { toStatusHistory } from "@/lib/candidate-crm";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import { extractText } from "@/lib/extract";

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
    expect(result.email).toBe("saharshini.e@gmail.com");
    expect(result.emailNormalized).toBe("saharshini.e@gmail.com");
    expect(result.phoneNormalized).toBe("5551234567");
    expect(result.phone).toContain("555");
    expect(hasContactDetails(result)).toBe(true);
  });

  it("supports dotted, underscored, and plus-tagged emails", () => {
    const result = extractContactsFromResumeText(`
John Doe
john.doe@gmail.com
john_doe@company.co.uk
candidate+jobs@email.com
`);
    expect(result.email).toBeTruthy();
    expect(isValidEmail(result.email!)).toBe(true);
    expect(result.email).toBe(result.email!.toLowerCase());
  });

  it("strips surrounding punctuation and lowercases emails", () => {
    expect(sanitizeEmailCandidate("<John.Doe@Gmail.com>,")).toBe(
      "john.doe@gmail.com"
    );
    const result = extractContactsFromResumeText(`
Contact: <ADEELVT@GMAIL.COM>.
`);
    expect(result.email).toBe("adeelvt@gmail.com");
  });

  it("ignores recruiter/template emails when a personal email exists", () => {
    const result = extractContactsFromResumeText(`
Jane Candidate
jane.candidate@gmail.com
Also contact careers@acme.com or noreply@portal.com
Phone +1 415-555-0199
`);
    expect(result.email).toBe("jane.candidate@gmail.com");
  });

  it("separates phone, email, and city from collapsed resume contact blocks", () => {
    const spaced = extractContactsFromResumeText(
      "7373210994 michealcrenshaw890909@gmail.com Baytown, TX"
    );
    expect(spaced.phoneNormalized).toBe("7373210994");
    expect(spaced.email).toBe("michealcrenshaw890909@gmail.com");
    expect(spaced.email).not.toContain("Baytown");
    expect(spaced.email).not.toMatch(/^\d/);

    const collapsed = extractContactsFromResumeText(
      "7373210994michealcrenshaw890909@gmail.comBaytown"
    );
    expect(collapsed.phoneNormalized).toBe("7373210994");
    expect(collapsed.email).toBe("michealcrenshaw890909@gmail.com");
    expect(collapsed.email).not.toContain("Baytown");
    expect(isCorruptEmailValue("7373210994michealcrenshaw890909@gmail.comBaytown")).toBe(
      true
    );
    expect(isCorruptEmailValue("michealcrenshaw890909@gmail.com")).toBe(false);

    const unicodeCollapsed = extractContactsFromResumeText(
      "(656) 205\u20117432candidate@gmail.comHouston"
    );
    expect(unicodeCollapsed.phoneNormalized?.endsWith("6562057432")).toBe(true);
    expect(unicodeCollapsed.email).toBe("candidate@gmail.com");

    const clean = extractContactsFromResumeText(`
+1 (850) 468-9007
candidate@acme.io
Orlando, FL
`);
    expect(clean.phoneNormalized?.endsWith("8504689007")).toBe(true);
    expect(clean.email).toBe("candidate@acme.io");
  });

  it("never persists phone digits or location as part of email", () => {
    expect(sanitizeEmailCandidate("7373210994michealcrenshaw890909@gmail.comBaytown")).toBe(
      "michealcrenshaw890909@gmail.com"
    );
    expect(isValidEmail("7373210994michealcrenshaw890909@gmail.comBaytown")).toBe(false);
    expect(isValidEmail("michealcrenshaw890909@gmail.comBaytown")).toBe(false);
    expect(isValidPhone("7373210994")).toBe(true);
    expect(isValidPhone("micheal@gmail.com")).toBe(false);
    expect(isCorruptPhoneValue("7373210994micheal@gmail.com")).toBe(true);
  });

  it("extracts phones with Unicode non-breaking hyphens and dash variants", () => {
    // Exact U+2011 NON-BREAKING HYPHEN between 205 and 7432 (do not replace with ASCII '-').
    const withNbHyphen = `(656) 205\u20117432`;
    expect(withNbHyphen).toContain("\u2011");
    expect(withNbHyphen).not.toContain("\u002D");

    const nb = extractContactsFromResumeText(`
Candidate Name
Phone: ${withNbHyphen}
candidate@example.com
`);
    expect(nb.phoneNormalized).toBe("6562057432");
    expect(nb.phone).toContain("656");
    expect(nb.phone).toContain("7432");

    const variants = [
      "(656) 205-7432", // ASCII hyphen-minus
      "(656) 205\u20107432", // U+2010 hyphen
      "(656) 205\u20117432", // U+2011 non-breaking hyphen
      "(656) 205\u20127432", // U+2012 figure dash
      "(656) 205\u20137432", // U+2013 en dash
      "(656) 205\u20147432", // U+2014 em dash
      "(656) 205\u22127432", // U+2212 minus sign
      "656 205 7432",
      "656.205.7432",
      "+1 (656) 205\u20117432",
      "1-656-205-7432",
      // Zero-width space between digits + NB hyphen
      "(656) 205\u200B\u20117432",
      // Non-breaking spaces
      "(656)\u00A0205\u20117432",
    ];
    for (const phone of variants) {
      const result = extractContactsFromResumeText(`
Name
Phone: ${phone}
person@example.com
`);
      expect(
        result.phoneNormalized?.endsWith("6562057432"),
        `failed for ${JSON.stringify(phone)} → ${result.phoneNormalized}`
      ).toBe(true);
    }

    expect(
      normalizeResumeTextForContactExtraction("(656) 205\u20117432")
    ).toBe("(656) 205-7432");
  });

  it("extracts common US phone formats", () => {
    const formats = [
      "703-409-7129",
      "(703) 409-7129",
      "+1 703 409 7129",
      "+1 (703) 409-7129",
      "703.409.7129",
    ];
    for (const phone of formats) {
      const result = extractContactsFromResumeText(`
Candidate Name
Phone: ${phone}
adeelvt@gmail.com
`);
      expect(result.phoneNormalized?.endsWith("7034097129")).toBe(true);
      expect(result.phone).toContain("703");
      expect(result.email).toBe("adeelvt@gmail.com");
    }
  });

  it("extracts international-style phones when supported", () => {
    const result = extractContactsFromResumeText(`
Candidate
+44 20 7946 0958
person@example.co.uk
`);
    expect(result.phone).toBeTruthy();
    expect(result.email).toBe("person@example.co.uk");
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

  it("does not treat dates, ZIPs, years, or job codes as phone numbers", () => {
    const result = extractContactsFromResumeText(`
Candidate Name
Job ID 162212
ZIP 78701
Started 2020
Date 2024-03-15
Employee 123456
`);
    expect(result.phone).toBeNull();
  });

  it("handles email-only and phone-only resumes", () => {
    const emailOnly = extractContactsFromResumeText(`Name\nonly@email.com\n`);
    expect(emailOnly.email).toBe("only@email.com");
    expect(emailOnly.phone).toBeNull();
    expect(emailOnly.status).toBe("completed");

    const phoneOnly = extractContactsFromResumeText(`Name\n(703) 409-7129\n`);
    expect(phoneOnly.phoneNormalized?.endsWith("7034097129")).toBe(true);
    expect(phoneOnly.email).toBeNull();
    expect(phoneOnly.status).toBe("completed");
  });

  it("protects manually corrected contact values from overwrite", () => {
    expect(canOverwriteContactWithResume("MANUAL")).toBe(false);
    expect(canOverwriteContactWithResume("MANUAL_CORRECTED")).toBe(false);
    expect(canOverwriteContactWithResume("IMPORTED")).toBe(false);
    expect(canOverwriteContactWithResume("RESUME")).toBe(true);
    expect(canOverwriteContactWithResume(null)).toBe(true);
    expect(canOverwriteContactWithResume("MANUAL", true)).toBe(true);
  });

  it("normalizes legacy extraction statuses including stale and not_started", () => {
    expect(normalizeContactExtractionStatus("NOT_PROCESSED")).toBe("not_started");
    expect(normalizeContactExtractionStatus("pending")).toBe("not_started");
    expect(normalizeContactExtractionStatus("EXTRACTED")).toBe("completed");
    expect(normalizeContactExtractionStatus("FAILED")).toBe("failed");
    expect(normalizeContactExtractionStatus("stale")).toBe("stale");
    expect(normalizeContactExtractionStatus("NOT_FOUND")).toBe("not_found");
  });

  it("shows Extracting… only while in-flight and terminal placeholders otherwise", () => {
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "not_started",
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
    ).toBe("—");
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "failed",
        canViewContact: true,
      })
    ).toBe("Failed");
    expect(
      displayContactValue({
        value: null,
        extractionStatus: "stale",
        canViewContact: true,
      })
    ).toBe("Timed out");
    expect(
      displayContactValue({
        value: "a@b.com",
        extractionStatus: "completed",
        canViewContact: false,
      })
    ).toBe("Restricted");
  });

  it("does not treat complete contacts as needing retry even when status is failed", () => {
    expect(
      needsContactExtractionRetry({
        email: "a@b.com",
        phone: "+1 (703) 409-7129",
        status: "failed",
        attempts: 1,
      })
    ).toBe(false);
    expect(
      needsContactExtractionRetry({
        email: "a@b.com",
        phone: null,
        status: "failed",
        attempts: 1,
      })
    ).toBe(true);
    expect(
      getContactFieldUiState({
        value: "a@b.com",
        extractionStatus: "failed",
        canViewContact: true,
      }).kind
    ).toBe("value");
    expect(
      getContactFieldUiState({
        value: null,
        extractionStatus: "failed",
        canViewContact: true,
        attempts: 1,
      })
    ).toMatchObject({ kind: "retryable", label: "Failed", canRetry: true });
  });

  it("marks stale processing jobs and allows retry under attempt cap", () => {
    expect(CONTACT_EXTRACTION_STALE_MS).toBe(120_000);
    const started = new Date(Date.now() - CONTACT_EXTRACTION_STALE_MS - 1_000).toISOString();
    expect(isContactExtractionStale("processing", started)).toBe(true);
    expect(isContactExtractionInFlight("processing", started)).toBe(false);
    expect(
      canRetryContactExtraction({
        status: "stale",
        attempts: 1,
      })
    ).toBe(true);
    expect(
      canRetryContactExtraction({
        status: "failed",
        attempts: CONTACT_EXTRACTION_MAX_ATTEMPTS,
      })
    ).toBe(false);
    expect(
      canRetryContactExtraction({
        status: "failed",
        attempts: CONTACT_EXTRACTION_MAX_ATTEMPTS,
        force: true,
      })
    ).toBe(true);
  });

  it("applies automatic retry backoff and permanent-failure skip", () => {
    expect(
      canAutoRetryContactExtraction({
        status: "failed",
        attempts: 1,
        completedAt: new Date().toISOString(),
      })
    ).toBe(false);
    expect(
      canAutoRetryContactExtraction({
        status: "failed",
        attempts: 1,
        completedAt: new Date(Date.now() - 6_000).toISOString(),
      })
    ).toBe(true);
    expect(
      canAutoRetryContactExtraction({
        status: "failed",
        attempts: 1,
        errorCategory: "empty_text",
        completedAt: new Date(Date.now() - 60_000).toISOString(),
      })
    ).toBe(false);
  });

  it("builds API contact_extraction summaries without leaking internals", () => {
    const summary = buildContactExtractionApiSummary({
      status: "failed",
      attempts: 2,
      startedAt: "2026-08-07T00:00:00.000Z",
      completedAt: "2026-08-07T00:01:00.000Z",
    });
    expect(summary).toEqual({
      status: "failed",
      attempts: 2,
      can_retry: true,
      started_at: "2026-08-07T00:00:00.000Z",
      completed_at: "2026-08-07T00:01:00.000Z",
    });
  });

  it("extracts email from plaintext that mirrors PDF/DOCX extraction output", async () => {
    const pdfLike = Buffer.from(
      `Mohammad Adeel\nadeelvt@gmail.com\n703-409-7129\nExperience at Acme.\n`,
      "utf8"
    );
    const extracted = await extractText(pdfLike, "resume.txt");
    expect(extracted.success).toBe(true);
    const contact = extractContactsFromResumeText(extracted.text);
    expect(contact.email).toBe("adeelvt@gmail.com");
    expect(contact.phoneNormalized?.endsWith("7034097129")).toBe(true);
  });

  it("fails unsupported document types instead of silently returning null text", async () => {
    const result = await extractText(Buffer.from("%PDF-fake"), "resume.xyz");
    expect(result.success).toBe(false);
    expect(result.quality).toBe("FAILED");
    expect(result.error).toMatch(/Unsupported/i);
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

  it("wires extraction lifecycle, polling, retry, and clickable candidate names", () => {
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
    const list = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "candidate-list.tsx"),
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
    const routes = readFileSync(
      join(process.cwd(), "src", "lib", "routes.ts"),
      "utf8"
    );

    expect(dal).toContain("applyResumeContactExtraction");
    expect(dal).toContain("finalizeStaleContactExtractions");
    expect(dal).toContain("resolvePendingContactExtractions");
    expect(dal).toContain('contact_extraction_status = ${"processing"}');
    expect(dal).toContain('contact_extraction_status = ${"stale"}');
    expect(dal).toContain("contact_extraction_resume_version");
    expect(upload).toContain("applyResumeContactExtraction");
    expect(table).toContain("CONTACT_EXTRACTION_POLL_MS");
    expect(table).toContain("retryContactExtraction");
    expect(cell).toContain("Retry contact extraction for");
    expect(cell).toContain("text-brand-700");
    expect(cell).toContain("hover:underline");
    expect(cell).toContain("getContactFieldUiState");
    expect(list).toContain("aria-label={`View");
    expect(list).toContain("text-brand-700");
    expect(list).toContain("candidateRoutes.detail");
    expect(list).toContain("returnTo");
    expect(list).toContain("/contact-extraction/retry");
    expect(list).toContain("Retry failed contact extraction");
    expect(list).toContain("aria-label={`Retry contact extraction for");
    expect(reextract).toContain("retryCandidateContactExtraction");
    expect(reextract).toContain("resume_reloaded");
    expect(routes).toContain("from");
    expect(canViewCandidateContact("VIEWER")).toBe(false);
    expect(CONTACT_EXTRACTION_POLL_MS).toBeGreaterThanOrEqual(2_000);
    expect(CONTACT_EXTRACTION_POLL_MAX_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("ships contact extraction schema migrations with lifecycle columns", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "contact-extract-schema.sql"),
      "utf8"
    );
    const v2 = readFileSync(
      join(process.cwd(), "scripts", "contact-extract-v2-schema.sql"),
      "utf8"
    );
    expect(sql).toContain("email_source");
    expect(sql).toContain("phone_source");
    expect(sql).toContain("contact_extraction_status");
    expect(sql).toContain("contact_extraction_started_at");
    expect(sql).toContain("contact_extraction_completed_at");
    expect(sql).toContain("contact_extraction_error");
    expect(sql).toContain("contact_extraction_attempts");
    expect(v2).toContain("contact_extraction_resume_version");
    expect(v2).toContain("contact_extraction_error_category");
    expect(v2).toContain("'stale'");
    expect(v2).toContain("DEFAULT 'not_started'");
  });
});
