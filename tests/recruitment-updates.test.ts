import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Final Decision label replacement", () => {
  it("uses Final Decision in disposition UI and export headers", () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "candidate-match",
        "recruiter-decision-panel.tsx"
      ),
      "utf8"
    );
    const detail = readFileSync(
      join(process.cwd(), "src", "components", "candidate", "candidate-detail.tsx"),
      "utf8"
    );
    const report = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "workspaces",
        "[workspaceId]",
        "report",
        "route.ts"
      ),
      "utf8"
    );

    expect(panel).toContain('title="Final Decision"');
    expect(panel).toContain("Final decision saved.");
    expect(panel).not.toContain('title="Recruiter Decision"');

    expect(detail).toContain('title="Final decision"');
    expect(detail).toContain("Final decision recorded.");
    expect(detail).not.toContain('title="Recruiter decision"');

    expect(report).toContain('"Final Decision"');
    expect(report).not.toContain('"Recruiter Decision"');
  });

  it("preserves internal API/disposition field names", () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "candidate-match",
        "recruiter-decision-panel.tsx"
      ),
      "utf8"
    );
    expect(panel).toContain("recruiter_disposition");
    expect(panel).toContain("recruiter_notes");
  });
});

describe("status change modal contract", () => {
  it("requires optional notes and guards duplicate submissions", () => {
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
    expect(modal).toContain("Notes");
    expect(modal).toContain("(optional)");
    expect(modal).toContain("Update Status");
    expect(modal).toContain("Select a new status to continue.");
    expect(modal).toContain("submittingRef");
    expect(modal).toContain("disabled={!canSubmit}");
    expect(modal).toContain("Status updated successfully.");
    expect(modal).toContain("Status History");
  });
});

describe("candidate listing contact and job code columns", () => {
  it("renders labeled Job Code, Phone, and Email columns with dash placeholders", () => {
    const list = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "candidate-list.tsx"),
      "utf8"
    );
    expect(list).toContain("Job Code");
    expect(list).toContain("Phone Number");
    expect(list).toContain("Email Address");
    expect(list).toContain("displayOrDash(row.job_code)");
    expect(list).toContain("displayOrDash(row.phone)");
    expect(list).toContain("displayOrDash(row.email)");
    expect(list).toContain("canViewContact");
  });
});
