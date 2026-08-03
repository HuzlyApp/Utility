import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Pure-source assertions for the responsive-design layer. The project's vitest
// config runs in the node environment (no jsdom / testing-library), so these
// tests validate that the shared responsive utilities and critical responsive
// classes exist in source. They guard against regressions where a shared
// utility or a mobile-critical class is accidentally removed.

const ROOT = resolve(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const GLOBALS = readSrc("src/app/globals.css");
const PRIMITIVES = readSrc("src/components/ui/primitives.tsx");
const APP_HEADER = readSrc("src/components/app/app-header.tsx");
const MOBILE_NAV = readSrc("src/components/app/mobile-nav.tsx");
const SUPERADMIN_LAYOUT = readSrc("src/app/superadmin/layout.tsx");
const TOAST = readSrc("src/components/ui/toast.tsx");
const RANKING_TABLE = readSrc("src/components/workspace/ranking-table.tsx");
const CANDIDATE_LIST = readSrc("src/components/dashboard/candidate-list.tsx");
const CONFIRM_MODAL = readSrc("src/components/ui/confirm-modal.tsx");
const DUPLICATE_DIALOG = readSrc(
  "src/components/workspace/duplicate-warning-dialog.tsx"
);
const UPDATE_RESUME_DIALOG = readSrc(
  "src/components/candidate/update-resume-dialog.tsx"
);
const COMPARE_DIALOG = readSrc("src/components/workspace/compare-dialog.tsx");

describe("responsive foundation (globals.css)", () => {
  it("guards the body against unintended horizontal page scrolling", () => {
    expect(GLOBALS).toContain("overflow-x: hidden");
  });

  it("prevents iOS input auto-zoom by bumping inputs to 16px on phones", () => {
    expect(GLOBALS).toContain("@media (max-width: 640px)");
    expect(GLOBALS).toContain("font-size: 16px");
  });

  it("provides shared scroll + dialog utilities used across components", () => {
    expect(GLOBALS).toContain(".scroll-x");
    expect(GLOBALS).toContain(".dialog-scroll");
  });

  it("respects reduced-motion preferences", () => {
    expect(GLOBALS).toContain("prefers-reduced-motion: reduce");
  });
});

describe("responsive navigation", () => {
  it("exposes a shared MobileNav drawer", () => {
    expect(MOBILE_NAV).toContain("export function MobileNav");
    // Drawer must be a full-height overlay with a focus trap + escape handling.
    expect(MOBILE_NAV).toContain("aria-modal");
    expect(MOBILE_NAV).toContain("Escape");
  });

  it("uses literal breakpoint classes (not dynamic templates) for Tailwind JIT", () => {
    // The className map must resolve to literal class strings so Tailwind's JIT
    // does not purge them. Confirm all three breakpoint variants are present as
    // string literals in the className resolution map.
    expect(MOBILE_NAV).toContain('"sm:hidden"');
    expect(MOBILE_NAV).toContain('"md:hidden"');
    expect(MOBILE_NAV).toContain('"lg:hidden"');
  });

  it("renders the MobileNav in the main app header so mobile users can navigate", () => {
    expect(APP_HEADER).toContain("MobileNav");
    // Desktop nav stays for larger screens.
    expect(APP_HEADER).toContain("md:flex");
  });

  it("renders a responsive superadmin header with a mobile drawer", () => {
    expect(SUPERADMIN_LAYOUT).toContain("MobileNav");
    expect(SUPERADMIN_LAYOUT).toContain("md:flex");
  });
});

describe("shared UI primitives", () => {
  it("makes Tabs horizontally scrollable instead of overflowing", () => {
    expect(PRIMITIVES).toMatch(/scroll-x|overflow-x-auto/);
  });

  it("clamps Tooltip width so it never overflows the viewport", () => {
    expect(PRIMITIVES).toContain("max-w-[min(14rem,80vw)]");
  });

  it("makes CardHeader wrap on small screens (title + action never overlap)", () => {
    expect(PRIMITIVES).toContain("sm:flex-row");
    expect(PRIMITIVES).toContain("min-w-0");
  });
});

describe("modals and dialogs fit the viewport", () => {
  it("ConfirmModal renders as a mobile bottom sheet with internal scroll", () => {
    expect(CONFIRM_MODAL).toContain("items-end");
    expect(CONFIRM_MODAL).toContain("sm:items-center");
    expect(CONFIRM_MODAL).toContain("max-h");
    expect(CONFIRM_MODAL).toContain("overflow-y-auto");
  });

  it("DuplicateWarningDialog scrolls internally and never exceeds the viewport", () => {
    expect(DUPLICATE_DIALOG).toContain("max-h-[92vh]");
    expect(DUPLICATE_DIALOG).toContain("dialog-scroll");
  });

  it("UpdateResumeDialog scrolls internally and never exceeds the viewport", () => {
    expect(UPDATE_RESUME_DIALOG).toContain("max-h-[92vh]");
    expect(UPDATE_RESUME_DIALOG).toContain("dialog-scroll");
  });

  it("CompareDialog scrolls internally and never exceeds the viewport", () => {
    expect(COMPARE_DIALOG).toContain("max-h-[92vh]");
    expect(COMPARE_DIALOG).toContain("dialog-scroll");
  });
});

describe("toasts", () => {
  it("anchored to both edges on mobile so they never overflow off-screen", () => {
    expect(TOAST).toContain("inset-x-4");
    expect(TOAST).toContain("bottom-4");
  });
});

describe("dense data tables", () => {
  it("ranking table uses horizontal scrolling for wide content", () => {
    expect(RANKING_TABLE).toContain("overflow-x-auto");
    expect(RANKING_TABLE).toContain("min-w-[");
  });

  it("ranking table filter controls grow to comfortable touch heights on mobile", () => {
    expect(RANKING_TABLE).toContain("h-9");
    expect(RANKING_TABLE).toContain("lg:h-8");
  });

  it("candidate list table has a min-width so columns do not crush on mobile", () => {
    expect(CANDIDATE_LIST).toContain("overflow-x-auto");
    expect(CANDIDATE_LIST).toContain("min-w-[");
  });
});
