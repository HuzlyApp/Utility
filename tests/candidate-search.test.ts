import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchesCandidateSearch,
  normalizeSearchQuery,
  toCandidateSearchPattern,
  toPhoneDigitsSearchPattern,
} from "@/lib/candidate-crm";
import { canViewCandidateContact } from "@/lib/auth/rbac";

const SAMPLE = {
  full_name: "MohammadAdeel Khan",
  email: "adeel@example.com",
  phone: "+1 (703) 409-7129",
  job_code: "162212",
  job_title: "Senior Python Engineer",
  status_name: "Phone Screen",
  assigned_recruiter_name: "Jane Recruiter",
};

describe("candidate search matching helpers", () => {
  it("matches partial and case-insensitive names", () => {
    expect(matchesCandidateSearch(SAMPLE, "adeel")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "ADEEL")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "  adeel  ")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "zzz")).toBe(false);
  });

  it("matches email, job code, job title, status, and recruiter", () => {
    expect(matchesCandidateSearch(SAMPLE, "adeel@example")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "162212")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "python")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "phone screen")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "jane")).toBe(true);
  });

  it("matches formatted and unformatted phone numbers", () => {
    expect(matchesCandidateSearch(SAMPLE, "7034097129")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "(703) 409-7129")).toBe(true);
    expect(matchesCandidateSearch(SAMPLE, "+1 703 409 7129")).toBe(true);
  });

  it("excludes contact fields when includeContact is false", () => {
    expect(
      matchesCandidateSearch(SAMPLE, "adeel@example.com", {
        includeContact: false,
      })
    ).toBe(false);
    expect(
      matchesCandidateSearch(SAMPLE, "7034097129", { includeContact: false })
    ).toBe(false);
    expect(
      matchesCandidateSearch(SAMPLE, "adeel", { includeContact: false })
    ).toBe(true);
  });

  it("builds ILIKE and phone digit patterns", () => {
    expect(normalizeSearchQuery("  adeel   khan ")).toBe("adeel khan");
    expect(toCandidateSearchPattern("adeel")).toBe("%adeel%");
    expect(toPhoneDigitsSearchPattern("703-409-7129")).toBe("%7034097129%");
    expect(toPhoneDigitsSearchPattern("ab")).toBeNull();
  });
});

describe("candidates page search UI contracts", () => {
  it("renders search above filters with URL param and empty state", () => {
    const page = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "candidates", "page.tsx"),
      "utf8"
    );
    const list = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "candidate-list.tsx"),
      "utf8"
    );
    const filters = readFileSync(
      join(
        process.cwd(),
        "src",
        "components",
        "dashboard",
        "candidate-list-filters.tsx"
      ),
      "utf8"
    );
    const input = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "job-search-input.tsx"),
      "utf8"
    );
    const dal = readFileSync(
      join(process.cwd(), "src", "lib", "dal", "candidates.ts"),
      "utf8"
    );

    expect(page).toContain("JobSearchInput");
    expect(page).toContain('paramName="search"');
    expect(page).toContain(
      'placeholder="Search candidates by name, email, phone, job code, or job"'
    );
    expect(page).toContain('s"} found');
    expect(page).toContain("searchContact: canViewContact");
    expect(list).toContain("No candidates match your search.");
    expect(list).toContain("Clear search");
    expect(list).toContain("whitespace-nowrap");
    expect(list).toContain("table-fixed");
    expect(list).toContain("md:hidden");
    expect(filters).toContain("Clear filters");
    expect(filters).toContain('params.set("search", search)');
    expect(input).toContain("DEBOUNCE_MS = 350");
    expect(input).toContain('aria-label="Clear search"');
    expect(dal).toContain("toCandidateSearchPattern");
    expect(dal).toContain("toPhoneDigitsSearchPattern");
    expect(dal).toContain("c.full_name ILIKE ${searchPattern}");
    expect(dal).toContain("searchContact");
    expect(dal).toContain("regexp_replace");
    expect(canViewCandidateContact("VIEWER")).toBe(false);
  });

  it("ships candidate search index migration", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "candidate-search-indexes.sql"),
      "utf8"
    );
    const migrate = readFileSync(
      join(process.cwd(), "scripts", "migrate.mjs"),
      "utf8"
    );
    expect(sql).toContain("idx_candidates_tenant_full_name_trgm");
    expect(sql).toContain("gin_trgm_ops");
    expect(migrate).toContain("candidate-search-indexes.sql");
  });
});
