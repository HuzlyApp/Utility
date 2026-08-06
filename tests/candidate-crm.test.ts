import { describe, expect, it } from "vitest";
import {
  assertSameTenant,
  buildStatusChangeMetadata,
  canEditNote,
  displayOrDash,
  extractStatusChangeNote,
  formatActivitySummary,
  matchesJobSearch,
  normalizeSearchQuery,
  shouldRecordStatusChange,
  toJobSearchPattern,
  toStatusHistory,
} from "@/lib/candidate-crm";
import { canManageTenant, canViewCandidateContact } from "@/lib/auth/rbac";

describe("candidate CRM status change rules", () => {
  it("skips history when status did not change", () => {
    expect(shouldRecordStatusChange("abc", "abc")).toBe(false);
    expect(shouldRecordStatusChange(null, "abc")).toBe(true);
    expect(shouldRecordStatusChange("abc", "def")).toBe(true);
  });

  it("builds metadata with an optional note", () => {
    expect(
      buildStatusChangeMetadata({
        previousStatusId: "s1",
        newStatusId: "s2",
        note: "  Called candidate  ",
      })
    ).toEqual({
      previous_status_id: "s1",
      new_status_id: "s2",
      note: "Called candidate",
    });
  });

  it("omits note from metadata when blank", () => {
    expect(
      buildStatusChangeMetadata({
        previousStatusId: null,
        newStatusId: "s2",
        note: "   ",
      })
    ).toEqual({
      previous_status_id: null,
      new_status_id: "s2",
    });
  });
});

describe("status history helpers", () => {
  it("extracts notes from status-change metadata", () => {
    expect(extractStatusChangeNote({ note: "Left voicemail" })).toBe(
      "Left voicemail"
    );
    expect(extractStatusChangeNote({ note: "  " })).toBeNull();
    expect(extractStatusChangeNote({})).toBeNull();
    expect(extractStatusChangeNote(null)).toBeNull();
  });

  it("maps STATUS_CHANGED rows into newest-first history entries", () => {
    const history = toStatusHistory([
      {
        id: "a1",
        action_type: "STATUS_CHANGED",
        previous_value: "New / Not Contacted",
        new_value: "Attempted Contact",
        performer_name: "Alex",
        metadata: { note: "No answer" },
        created_at: "2026-08-06T12:00:00.000Z",
      },
      {
        id: "a2",
        action_type: "NOTE_ADDED",
        previous_value: null,
        new_value: "hello",
        performer_name: "Alex",
        metadata: {},
        created_at: "2026-08-06T11:00:00.000Z",
      },
      {
        id: "a3",
        action_type: "STATUS_CHANGED",
        previous_value: null,
        new_value: "New / Not Contacted",
        performer_name: "Sam",
        metadata: {},
        created_at: "2026-08-06T10:00:00.000Z",
      },
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      id: "a1",
      previousStatus: "New / Not Contacted",
      newStatus: "Attempted Contact",
      note: "No answer",
      updatedBy: "Alex",
    });
    expect(history[1].note).toBeNull();
    expect(history[1].newStatus).toBe("New / Not Contacted");
  });

  it("preserves activity order so newest status changes stay first", () => {
    const history = toStatusHistory([
      {
        id: "newer",
        action_type: "STATUS_CHANGED",
        previous_value: "A",
        new_value: "B",
        performer_name: "A",
        metadata: {},
        created_at: "2026-08-06T14:00:00.000Z",
      },
      {
        id: "older",
        action_type: "STATUS_CHANGED",
        previous_value: "B",
        new_value: "C",
        performer_name: "B",
        metadata: {},
        created_at: "2026-08-06T13:00:00.000Z",
      },
    ]);
    expect(history.map((h) => h.id)).toEqual(["newer", "older"]);
  });
});

describe("candidate listing display helpers", () => {
  it("shows a dash for missing phone, email, or job code values", () => {
    expect(displayOrDash(null)).toBe("—");
    expect(displayOrDash(undefined)).toBe("—");
    expect(displayOrDash("")).toBe("—");
    expect(displayOrDash("  ")).toBe("—");
    expect(displayOrDash("JOB-42")).toBe("JOB-42");
    expect(displayOrDash(" 555-0100 ")).toBe("555-0100");
  });
});

describe("job workspace search", () => {
  const jobs = [
    {
      job_title: "Senior Python Software Engineer",
      job_ref: "162212",
      department: "Engineering",
      msp_or_client: "Acme Health",
      location: "Austin, TX",
      specialty: "Software",
    },
    {
      job_title: "Radiology Tech",
      job_ref: "RAD-22",
      department: "Imaging",
      msp_or_client: "Metro Hospital",
      location: "Dallas, TX",
      specialty: null,
    },
    {
      job_title: "Night Shift PCA",
      job_ref: null,
      department: null,
      msp_or_client: null,
      location: null,
      specialty: null,
    },
  ];

  it("normalizes whitespace in the search query", () => {
    expect(normalizeSearchQuery("  travel   icu  ")).toBe("travel icu");
    expect(normalizeSearchQuery(null)).toBe("");
  });

  it("matches by job title case-insensitively and partially", () => {
    expect(matchesJobSearch(jobs[0], "Python")).toBe(true);
    expect(matchesJobSearch(jobs[0], "python")).toBe(true);
    expect(matchesJobSearch(jobs[0], "PYTHON")).toBe(true);
    expect(matchesJobSearch(jobs[0], "Senior Python")).toBe(true);
    expect(matchesJobSearch(jobs[1], "python")).toBe(false);
  });

  it("matches by job code / job id", () => {
    expect(matchesJobSearch(jobs[0], "162212")).toBe(true);
    expect(matchesJobSearch(jobs[1], "rad-22")).toBe(true);
    expect(matchesJobSearch(jobs[1], "162212")).toBe(false);
  });

  it("matches by client, department, location, and specialty when available", () => {
    expect(matchesJobSearch(jobs[0], "acme")).toBe(true);
    expect(matchesJobSearch(jobs[0], "engineering")).toBe(true);
    expect(matchesJobSearch(jobs[0], "austin")).toBe(true);
    expect(matchesJobSearch(jobs[0], "software")).toBe(true);
    expect(matchesJobSearch(jobs[2], "austin")).toBe(false);
  });

  it("returns empty results when nothing matches", () => {
    const matches = jobs.filter((j) => matchesJobSearch(j, "pharmacy"));
    expect(matches).toEqual([]);
  });

  it("keeps all jobs when the query is blank (clear restores full list)", () => {
    expect(jobs.every((j) => matchesJobSearch(j, "   "))).toBe(true);
    expect(jobs.every((j) => matchesJobSearch(j, ""))).toBe(true);
  });

  it("works alongside status-style filtering of a prefiltered list", () => {
    const activeLike = jobs.slice(0, 2);
    const matches = activeLike.filter((j) => matchesJobSearch(j, "rad"));
    expect(matches).toHaveLength(1);
    expect(matches[0].job_ref).toBe("RAD-22");
  });

  it("builds ILIKE patterns and strips wildcard characters from input", () => {
    expect(toJobSearchPattern("  Python  ")).toBe("%Python%");
    expect(toJobSearchPattern("162212")).toBe("%162212%");
    expect(toJobSearchPattern("  ")).toBeNull();
    expect(toJobSearchPattern("100%_ready")).toBe("%100 ready%");
  });
});

describe("candidate note permissions", () => {
  it("allows authors to edit their own notes", () => {
    expect(
      canEditNote({
        authorUserId: "u1",
        actorUserId: "u1",
        actorRole: "RECRUITER",
      })
    ).toBe(true);
  });

  it("blocks recruiters from editing others notes", () => {
    expect(
      canEditNote({
        authorUserId: "u1",
        actorUserId: "u2",
        actorRole: "RECRUITER",
      })
    ).toBe(false);
  });

  it("allows tenant admins to manage others notes", () => {
    expect(
      canEditNote({
        authorUserId: "u1",
        actorUserId: "admin",
        actorRole: "TENANT_ADMIN",
      })
    ).toBe(true);
  });
});

describe("activity summaries", () => {
  it("formats status changes with previous and new values", () => {
    expect(
      formatActivitySummary({
        actionType: "STATUS_CHANGED",
        previousValue: "Pending Review",
        newValue: "Qualified",
      })
    ).toBe('Status changed from "Pending Review" to "Qualified"');
  });

  it("formats assignment changes", () => {
    expect(
      formatActivitySummary({
        actionType: "CANDIDATE_ASSIGNED",
        previousValue: null,
        newValue: "Maria Santos",
      })
    ).toContain("Maria Santos");
  });
});

describe("cross-tenant protection helpers", () => {
  it("rejects mismatched tenant ids", () => {
    expect(assertSameTenant("tenant-a", "tenant-b")).toBe(false);
    expect(assertSameTenant("tenant-a", "tenant-a")).toBe(true);
    expect(assertSameTenant(null, "tenant-a")).toBe(false);
  });
});

describe("status settings RBAC", () => {
  it("recruiters cannot manage status options", () => {
    expect(canManageTenant("RECRUITER")).toBe(false);
    expect(canManageTenant("TENANT_ADMIN")).toBe(true);
    expect(canManageTenant("SUPER_ADMIN")).toBe(true);
  });
});

describe("candidate contact permissions", () => {
  it("hides contact details from viewers", () => {
    expect(canViewCandidateContact("VIEWER")).toBe(false);
    expect(canViewCandidateContact("RECRUITER")).toBe(true);
    expect(canViewCandidateContact("TENANT_ADMIN")).toBe(true);
    expect(canViewCandidateContact("SUPER_ADMIN")).toBe(true);
  });
});
