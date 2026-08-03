import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activityRowsToCsv,
  averageFollowUpHours,
  canViewRecruiterActivity,
  computeProductivityScore,
  formatFeedDescription,
  isMeaningfulCandidateAction,
  mapDispositionToActivityType,
  mapStatusNameToActivityType,
  percentChange,
  productivityRowsToCsv,
  resolveDateRange,
  resolveScopedRecruiterId,
  sourceFromRole,
} from "@/lib/recruiter-activity";
import { formatActivitySummary } from "@/lib/candidate-crm";

describe("recruiter activity schema", () => {
  const sql = readFileSync(
    join(process.cwd(), "scripts", "recruiter-activity-schema.sql"),
    "utf8"
  );

  it("extends candidate_activity_logs with idempotency and source columns", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS request_id");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS source");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS analysis_id");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS note_id");
    expect(sql).toContain("idx_candidate_activity_request_id");
    expect(sql).toContain("CREATE OR REPLACE VIEW recruiter_activity_logs");
  });

  it("makes candidate_id nullable for login/job events", () => {
    expect(sql).toContain("ALTER COLUMN candidate_id DROP NOT NULL");
  });
});

describe("permissions", () => {
  it("allows tenant admin to view any recruiter in tenant", () => {
    expect(
      canViewRecruiterActivity({
        viewerRole: "TENANT_ADMIN",
        viewerUserId: "admin-1",
        viewerTenantId: "t1",
        targetRecruiterId: "r1",
        targetTenantId: "t1",
      })
    ).toBe(true);
  });

  it("blocks cross-tenant access", () => {
    expect(
      canViewRecruiterActivity({
        viewerRole: "TENANT_ADMIN",
        viewerUserId: "admin-1",
        viewerTenantId: "t1",
        targetRecruiterId: "r1",
        targetTenantId: "t2",
      })
    ).toBe(false);
  });

  it("allows recruiter self-view only", () => {
    expect(
      canViewRecruiterActivity({
        viewerRole: "RECRUITER",
        viewerUserId: "r1",
        viewerTenantId: "t1",
        targetRecruiterId: "r1",
        targetTenantId: "t1",
      })
    ).toBe(true);
    expect(
      canViewRecruiterActivity({
        viewerRole: "RECRUITER",
        viewerUserId: "r1",
        viewerTenantId: "t1",
        targetRecruiterId: "r2",
        targetTenantId: "t1",
      })
    ).toBe(false);
  });

  it("forces scoped recruiter id for non-admins", () => {
    expect(
      resolveScopedRecruiterId({
        viewerRole: "RECRUITER",
        viewerUserId: "r1",
        requestedRecruiterId: "r2",
      })
    ).toBe("r1");
    expect(
      resolveScopedRecruiterId({
        viewerRole: "TENANT_ADMIN",
        viewerUserId: "a1",
        requestedRecruiterId: "r2",
      })
    ).toBe("r2");
  });

  it("maps actor role to activity source", () => {
    expect(sourceFromRole("TENANT_ADMIN")).toBe("tenant_admin");
    expect(sourceFromRole("RECRUITER")).toBe("recruiter");
    expect(sourceFromRole("SUPER_ADMIN")).toBe("super_admin");
  });
});

describe("date ranges", () => {
  const now = new Date("2026-08-03T15:00:00.000Z");

  it("resolves last 7 days and previous equivalent period", () => {
    const range = resolveDateRange("last_7_days", { now });
    expect(range.from.toISOString()).toBe("2026-07-28T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    const duration = range.to.getTime() - range.from.getTime();
    expect(range.previousTo.getTime()).toBe(range.from.getTime());
    expect(range.previousFrom.getTime()).toBe(range.from.getTime() - duration);
  });

  it("resolves today", () => {
    const range = resolveDateRange("today", { now });
    expect(range.from.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("requires custom bounds", () => {
    expect(() => resolveDateRange("custom", { now })).toThrow(/Custom date/);
  });
});

describe("KPI and score math", () => {
  it("computes percent change", () => {
    expect(percentChange(128, 112)).toBe(14.3);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("computes productivity score from weights", () => {
    const counts = {
      candidatesAdded: 10,
      candidatesWorked: 10,
      analysesCompleted: 5,
      notesAdded: 5,
      statusChanges: 5,
      qualified: 2,
      submitted: 2,
      interviews: 1,
      offers: 1,
      hired: 1,
      rejected: 0,
    };
    const maxes = { ...counts };
    expect(computeProductivityScore(counts, maxes)).toBe(100);
    expect(
      computeProductivityScore(
        { ...counts, candidatesWorked: 0, analysesCompleted: 0, notesAdded: 0 },
        maxes
      )
    ).toBeLessThan(100);
  });

  it("averages follow-up hours", () => {
    expect(averageFollowUpHours([])).toBeNull();
    expect(averageFollowUpHours([2 * 3600 * 1000, 4 * 3600 * 1000])).toBe(3);
  });

  it("identifies meaningful candidate actions", () => {
    expect(isMeaningfulCandidateAction("NOTE_ADDED")).toBe(true);
    expect(isMeaningfulCandidateAction("USER_LOGIN")).toBe(false);
    expect(isMeaningfulCandidateAction("STATUS_CHANGED")).toBe(true);
  });
});

describe("activity mapping and formatting", () => {
  it("maps dispositions and statuses", () => {
    expect(mapDispositionToActivityType("PROCEED_TO_SCREENING")).toBe(
      "CANDIDATE_QUALIFIED"
    );
    expect(mapDispositionToActivityType("DO_NOT_PURSUE_FOR_THIS_JOB")).toBe(
      "CANDIDATE_REJECTED"
    );
    expect(mapStatusNameToActivityType("Candidate selected")).toBe("CANDIDATE_HIRED");
    expect(mapStatusNameToActivityType("Unreachable")).toBe("CANDIDATE_UNREACHABLE");
  });

  it("formats feed and CRM summaries for new types", () => {
    expect(
      formatFeedDescription({
        recruiterName: "Maria Santos",
        actionType: "NOTE_ADDED",
        candidateName: "Angela Cruz",
      })
    ).toBe("Maria Santos added a note to Angela Cruz");

    expect(
      formatActivitySummary({
        actionType: "JOB_CREATED",
        newValue: "Registered Nurse",
      })
    ).toContain("Job created");
    expect(formatActivitySummary({ actionType: "USER_LOGIN" })).toBe("Signed in");
  });
});

describe("CSV export", () => {
  it("shapes productivity CSV", () => {
    const csv = productivityRowsToCsv([
      {
        recruiter_name: "Maria Santos",
        recruiter_email: "maria@example.com",
        role: "RECRUITER",
        assigned_candidates: 3,
        candidates_added: 2,
        candidates_worked: 5,
        analyses_completed: 1,
        notes_added: 4,
        status_changes: 2,
        qualified: 1,
        submitted: 1,
        interviews: 0,
        offers: 0,
        hired: 0,
        rejected: 0,
        avg_follow_up_hours: "2.5",
        last_activity: "2026-08-03T10:00:00.000Z",
        productivity_score: "82.5",
      },
    ]);
    expect(csv.split("\n")[0]).toContain("recruiter_name");
    expect(csv).toContain("Maria Santos");
    expect(csv).toContain("maria@example.com");
  });

  it("escapes activity CSV fields", () => {
    const csv = activityRowsToCsv([
      {
        recruiter_name: 'Lee, "James"',
        recruiter_email: "lee@example.com",
        activity_type: "NOTE_ADDED",
        candidate: "John Smith",
        job: "RN",
        previous_value: "",
        new_value: 'Said "hello"',
        timestamp: "2026-08-03T10:00:00.000Z",
        tenant: "Acme",
        candidate_id: "c1",
        job_id: "j1",
        activity_id: "a1",
      },
    ]);
    expect(csv).toContain('"Lee, ""James"""');
    expect(csv).toContain('"Said ""hello"""');
  });
});
