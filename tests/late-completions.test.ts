import { describe, expect, it } from "vitest";
import { buildOrgLearners, type OrgTraining } from "@/lib/org-learners";

/**
 * "Completed late" counts a course once, from its newest certificate — not
 * every certificate the course ever gathered. The Courses page showed
 * "Completed late 19" beside "Completed 18" because an expired certificate
 * and a renewal each counted again.
 */
describe("late completions", () => {
  it("counts a course once, from its newest certificate", () => {
    const courses = new Map([["c1", { title: "Fire", topic: null, estimatedMinutes: null }]]);
    const training: OrgTraining = {
      users: [{ id: "u1", full_name: "Amina", email: "a@example.com", status: "active", last_seen_at: null }],
      enrolments: [
        { id: "e1", user_id: "u1", course_id: "c1", status: "completed", progress: 100, due_date: "2026-01-01", assigned_at: "2025-12-01T00:00:00Z", last_reminder_at: null, time_spent: 0 },
      ],
      // Newest first, as the read orders them: a renewal last month (late), and
      // the original a year before (also after the due date).
      certificates: [
        { id: "k2", user_id: "u1", course_id: "c1", issued_at: "2026-10-01T10:00:00Z", expires_at: null },
        { id: "k1", user_id: "u1", course_id: "c1", issued_at: "2026-02-01T10:00:00Z", expires_at: "2026-09-01T00:00:00Z" },
      ],
      courses,
    };
    const [row] = buildOrgLearners(training);
    expect(row.lateCompletions).toBe(1);
    expect(row.stats.completed).toBe(1);
  });

  it("is not late when the newest certificate came before the due date", () => {
    const courses = new Map([["c1", { title: "Fire", topic: null, estimatedMinutes: null }]]);
    const training: OrgTraining = {
      users: [{ id: "u1", full_name: "Amina", email: null, status: "active", last_seen_at: null }],
      enrolments: [{ id: "e1", user_id: "u1", course_id: "c1", status: "completed", progress: 100, due_date: "2026-12-01", assigned_at: "2026-01-01T00:00:00Z", last_reminder_at: null, time_spent: 0 }],
      certificates: [{ id: "k1", user_id: "u1", course_id: "c1", issued_at: "2026-06-01T10:00:00Z", expires_at: null }],
      courses,
    };
    expect(buildOrgLearners(training)[0].lateCompletions).toBe(0);
  });
});
