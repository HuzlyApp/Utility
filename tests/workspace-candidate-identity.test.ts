import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { displayOrDash } from "@/lib/candidate-crm";
import { canViewCandidateContact } from "@/lib/auth/rbac";
import { displayCandidateName } from "@/lib/resume-name";

describe("workspace candidate identity fields", () => {
  it("returns and renders job code, phone, and email under the candidate name", () => {
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "candidates.ts"),
      "utf8"
    );
    const types = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "types.ts"),
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
    const table = readFileSync(
      join(process.cwd(), "src", "components", "workspace", "ranking-table.tsx"),
      "utf8"
    );
    const card = readFileSync(
      join(process.cwd(), "src", "components", "workspace", "candidate-card.tsx"),
      "utf8"
    );

    expect(types).toContain("candidate_name");
    expect(types).toContain("job_code");
    expect(types).toContain("phone_number");
    expect(types).toContain("can_view_contact");

    expect(dal).toContain("w.job_ref AS job_code");
    expect(dal).toContain("c.phone AS phone_number");
    expect(dal).toContain("c.email");
    expect(dal).toContain("can_view_contact: canViewContact");

    expect(cell).toContain("Job Code:");
    expect(cell).toContain("Phone:");
    expect(cell).toContain("Email:");
    expect(cell).toContain("mailto:");
    expect(cell).toContain("tel:");
    expect(cell).toContain("displayContactValue");
    expect(cell).toContain("displayOrDash");
    expect(cell).toContain("Retry extraction");
    expect(table).toContain("CandidateIdentityCell");
    expect(table).toContain("r.job_code");
    expect(table).toContain("r.phone_number");
    expect(table).toContain("r.email");
    expect(table).toContain("CONTACT_EXTRACTION_POLL_MS");
    expect(card).toContain("CandidateIdentityCell");
    expect(card).toContain("onRetryContactExtraction");
  });

  it("keeps long candidate names intact for display", () => {
    expect(displayCandidateName("Saharshini Eppakayalla")).toBe(
      "Saharshini Eppakayalla"
    );
    expect(displayCandidateName("JaswanthRaj Bantu Aindla")).toBe(
      "JaswanthRaj Bantu Aindla"
    );
  });

  it("uses dash placeholders for missing contact values", () => {
    expect(displayOrDash(null)).toBe("—");
    expect(displayOrDash("")).toBe("—");
    expect(displayOrDash("162212")).toBe("162212");
  });

  it("redacts contact for viewers at the permission layer", () => {
    expect(canViewCandidateContact("VIEWER")).toBe(false);
    expect(canViewCandidateContact("RECRUITER")).toBe(true);
  });
});
