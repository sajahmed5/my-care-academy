import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe as describeRow } from "../lib/activity";
import { FEATURES } from "../lib/features";

const row = (over: Partial<Parameters<typeof describeRow>[0]> = {}) => ({
  id: "1",
  action: "staff.deactivated",
  entity: "user",
  entity_id: "u1",
  actor_id: "a1",
  actor_email: "manager@example.test",
  detail: null,
  created_at: "2026-10-07T15:00:00Z",
  ...over,
});

describe("activity, in words a manager would use", () => {
  it("names the person an action was about", () => {
    expect(describeRow(row(), "Amina Hassan")).toBe("Deactivated Amina Hassan");
    expect(describeRow(row({ action: "staff.reactivated" }), "Amina Hassan")).toBe(
      "Reactivated Amina Hassan",
    );
  });

  it("falls back to something true when the person is gone", () => {
    expect(describeRow(row(), null)).toBe("Deactivated a member of staff");
  });

  it("counts an assignment in carers and courses", () => {
    expect(
      describeRow(
        row({
          action: "training.assigned",
          entity: "enrolment",
          detail: { courses: 3, learners: 20, dueDate: "2026-10-31" },
        }),
        null,
      ),
    ).toBe("Assigned 3 courses to 20 carers, due 31 Oct 2026");
  });

  it("uses the singular where it should", () => {
    expect(
      describeRow(
        row({ action: "training.assigned", detail: { courses: 1, learners: 1 } }),
        null,
      ),
    ).toBe("Assigned 1 course to 1 carer");
  });

  it("says who was invited, and flags an admin invite", () => {
    expect(
      describeRow(row({ action: "user.invited", detail: { email: "jo@x.test", role: "org_admin" } }), null),
    ).toBe("Invited jo@x.test as a manager");
  });

  it("leaves out an action it has no words for rather than saying 'Made a change'", () => {
    // The feed used to show "Made a change" for most of the HR and
    // recruitment trail (issue report 103, 7 Nov 2026).
    expect(describeRow(row({ action: "something.new", detail: null }), null)).toBeNull();
  });

  it("says what an HR action was, naming the person", () => {
    expect(
      describeRow(row({ action: "hr.leaver_recorded", detail: { reason: "resigned", lastDay: "2026-11-03" } }), "Ammara Te"),
    ).toBe("Recorded that Ammara Te is leaving (resigned), last day 3 Nov 2026");
    expect(
      describeRow(row({ action: "hr.absence_recorded", detail: { reason: "Back, neck or other muscle pain" } }), "Ammara Te"),
    ).toBe("Recorded Ammara Te off sick: Back, neck or other muscle pain");
    expect(describeRow(row({ action: "hr.training_record_emailed" }), "Ammara Te")).toBe("Emailed Ammara Te their training record");
    expect(describeRow(row({ action: "hr.leaver_login_off", detail: { by: "hand" } }), "Ammara Te")).toBe("Switched off Ammara Te's login");
    expect(describeRow(row({ action: "hr.leaver_login_off", detail: { lastDay: "2026-11-03" } }), "Ammara Te")).toBe(
      "Switched off Ammara Te's login after their last day",
    );
  });

  it("describes recruitment and the case file without a person's name", () => {
    expect(
      describeRow(row({ action: "candidate.hired", entity: "candidate", detail: { login: true, induction_courses: 16 } }), null),
    ).toBe("Hired a candidate and assigned 16 induction courses, with a login");
    expect(
      describeRow(row({ action: "candidate.document_not_required", entity: "candidate", detail: { doc_type: "shadowing" } }), null),
    ).toBe("Marked the shadowing record as not needed for a candidate");
    expect(
      describeRow(row({ action: "hr.case_opened", entity: "hr_case", detail: { kind: "disciplinary", ref: "DIS-2026-001" } }), null),
    ).toBe("Opened disciplinary case DIS-2026-001");
    expect(describeRow(row({ action: "issue_report.created", detail: { summary: "Recent Activity" } }), null)).toBe(
      "Reported a problem: Recent Activity",
    );
  });

  it("gets the article and the month right", () => {
    expect(describeRow(row({ action: "audit.recorded", entity: "audit", detail: { kind: "infection_control", score: 100, findings: 0 } }), null)).toBe(
      "Recorded an infection control audit, scored 100, 0 findings",
    );
    expect(describeRow(row({ action: "audit.recorded", entity: "audit", detail: { kind: "medication", score: 91, findings: 1 } }), null)).toBe(
      "Recorded a medication audit, scored 91, 1 finding",
    );
    expect(describeRow(row({ action: "governance.pdf", entity: "organisation", detail: { month: "2026-10" } }), null)).toBe(
      "Downloaded the governance report for October 2026",
    );
  });

  it("names a supervision, with its date and the actions agreed", () => {
    expect(
      describeRow(
        row({ action: "supervision.recorded", detail: { kind: "supervision", heldOn: "2026-11-05", actions: 1 } }),
        "Linda Grimshaw",
      ),
    ).toBe("Recorded Linda Grimshaw's supervision held 5 Nov 2026, 1 action agreed");
    expect(
      describeRow(row({ action: "appraisal.booked", detail: { bookedOn: "2026-11-12", bookedTime: "10:00" } }), "Linda Grimshaw"),
    ).toBe("Booked Linda Grimshaw's appraisal for 12 Nov 2026 at 10:00");
  });
});

/** Every dotted key on a line that mentions an action, in app/ and lib/. */
function loggedActions(): string[] {
  const keys = new Set<string>();
  const root = join(__dirname, "..");
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "node_modules") walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name) || full.endsWith(join("lib", "activity.ts"))) continue;
      for (const line of readFileSync(full, "utf8").split("\n")) {
        if (!/\baction\b/.test(line)) continue;
        for (const m of line.matchAll(/"([a-z][a-z_]*\.[a-z_]+(?:\.[a-z_]+)?)"/g)) keys.add(m[1]);
      }
    }
  };
  walk(join(root, "app"));
  walk(join(root, "lib"));
  // A feature key ("recruitment.tracker") on a line that mentions an action
  // is not an action.
  for (const f of FEATURES) keys.delete(f.key);
  return [...keys].sort();
}

/** Keys the code builds from a variable, so the scan can't see them. */
const BUILT_ACTIONS = [
  "spot_check.training_assigned",
  "competency.training_assigned",
  "supervision.booked",
  "appraisal.booked",
  "supervision.booking_cancelled",
  "appraisal.booking_cancelled",
  "hr.leave_approved",
  "hr.leave_declined",
  "alert_endpoint.paused",
  "alert_endpoint.resumed",
  "alert_endpoint.removed",
  "recruitment.questions_saved",
  "recruitment.interview_questions_saved",
  "recruitment.literacy_saved",
];

/** Bookkeeping rows that are left out of the feed on purpose. */
const LEFT_OUT = new Set(["complaint.stages_seeded", "tier.composition.updated"]);

describe("every action the app logs has words", () => {
  const actions = [...new Set([...loggedActions(), ...BUILT_ACTIONS])];

  it("finds the actions in the code", () => {
    expect(actions.length).toBeGreaterThan(150);
    expect(actions).toContain("hr.leaver_recorded");
    expect(actions).toContain("candidate.hired");
  });

  it.each(actions)("%s", (action) => {
    const text = describeRow(row({ action, entity: "thing", detail: {} }), null);
    if (LEFT_OUT.has(action)) {
      expect(text).toBeNull();
      return;
    }
    expect(text, `no words for ${action}`).toBeTruthy();
    // No system words: a raw key has a dot or an underscore in it.
    expect(text).not.toMatch(/[a-z]\.[a-z]|_/);
    expect(text!.trim()).toBe(text);
    expect(text).not.toContain("  ");
  });
});
