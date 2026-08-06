import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("candidates table column set", () => {
  it("removes Notes and Actions while keeping clickable candidate names and status controls", () => {
    const list = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "candidate-list.tsx"),
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

    expect(list).not.toContain(">Notes<");
    expect(list).not.toContain(">Actions<");
    expect(list).not.toContain("notes_count");
    expect(list).not.toMatch(/>\s*Open\s*</);
    expect(list).toContain("Last updated");
    expect(list).toContain("candidateRoutes.detail");
    expect(list).toContain("displayCandidateName");
    expect(list).toContain("CandidateStatusSelect");
    expect(list).toContain("width: \"190px\"");
    expect(list).toContain("width: \"145px\"");

    expect(modal).toContain("Notes");
    expect(select).toContain("View status history");
  });
});
