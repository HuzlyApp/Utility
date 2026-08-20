import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("import candidates feature contracts", () => {
  it("adds Import Candidates beside upload/paste without replacing them", () => {
    const add = read("src/components/workspace/add-candidates.tsx");
    expect(add).toContain("Select files");
    expect(add).toContain("Paste résumé text");
    expect(add).toContain("Import Candidates");
    expect(add).toContain("ImportCandidatesModal");
    expect(add).toContain("talent database");
  });

  it("opens a recommended/all search UI with match score, tags, and already-added state", () => {
    const modal = read("src/components/workspace/import-candidates-modal.tsx");
    expect(modal).toContain("Recommended");
    expect(modal).toContain("All Candidates");
    expect(modal).toContain("Search candidates...");
    expect(modal).toContain("Clear Filters");
    expect(modal).toContain("Already Added");
    expect(modal).toContain("% Match");
    expect(modal).toContain("Why they match");
    expect(modal).toContain("Import Selected Candidates");
    expect(modal).toContain("DEBOUNCE_MS = 400");
    expect(modal).toContain("No candidates found");
    expect(modal).toContain("/api/workspaces/${workspaceId}/candidates/import");
    expect(modal).toContain("candidateIds");
    expect(modal).toContain("notifyWorkspaceCandidatesChanged");
    expect(modal).toContain("sm:max-h-[calc(100dvh-32px)]");
    expect(modal).toContain("sm:w-[min(1200px,calc(100vw-32px))]");
    expect(modal).toContain("overflow-y-auto");
    expect(modal).toContain("overscroll-contain");
    expect(modal).toContain("xl:grid-cols-6");
    expect(modal).toContain("overflow-x-auto");
  });

  it("searches the full tenant candidate database server-side with pagination", () => {
    const dal = read("src/lib/dal/candidate-import.ts");
    const route = read(
      "src/app/api/workspaces/[workspaceId]/candidates/import/route.ts"
    );
    expect(route).toContain("searchCandidatesForImport");
    expect(route).toContain("importExistingCandidatesToWorkspace");
    expect(dal).toContain("extracted_resume_text");
    expect(dal).toContain("IMPORT_MATCH_FETCH_CAP");
    expect(dal).toContain("LIMIT ${fetchLimit}");
    expect(dal).toContain("scoreCandidateAgainstJob");
    expect(dal).toContain("already_added");
    expect(dal).toContain("ON CONFLICT (workspace_id, candidate_id) DO NOTHING");
    expect(dal).toContain("CANDIDATE_ADDED_TO_JOB");
    expect(dal).not.toContain("DO UPDATE SET status");
  });

  it("blocks duplicate job links by candidate id while allowing the same person on other jobs", () => {
    const dal = read("src/lib/dal/candidate-import.ts");
    const schema = read("scripts/dashboard-schema.sql");
    expect(schema).toContain("UNIQUE (workspace_id, candidate_id)");
    expect(dal).toContain("jmc.candidate_id = ANY(${uniqueIds}::uuid[])");
    expect(dal).toContain("skippedAlreadyAdded");
    expect(dal).toContain("c.tenant_id = ${tenantId}");
  });
});
