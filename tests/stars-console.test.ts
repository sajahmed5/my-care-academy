import { describe, it, expect } from "vitest";
import { byCourse, monthlySeries, periodBounds, starEvents, summarise } from "../lib/stars-console";
import { computeStarTotal } from "../lib/stars";

const U = "user-1";
const C = "course-a";

describe("starEvents (console stars)", () => {
  it("banks a first attempt, then only the improvement on a retake", () => {
    const events = starEvents(
      [
        { user_id: U, course_id: C, score: 70, passed: false, questions: 20, submitted_at: "2026-09-16T10:00:00Z" },
        { user_id: U, course_id: C, score: 85, passed: true, questions: 20, submitted_at: "2026-10-14T10:00:00Z" },
        { user_id: U, course_id: C, score: 75, passed: true, questions: 20, submitted_at: "2026-10-20T10:00:00Z" },
      ],
      [],
      [],
    );
    expect(events.map((e) => [e.delta, e.outcome])).toEqual([
      [14, "first"],
      [3, "improved"],
      [0, "no_gain"],
    ]);
    expect(events[1].bestBefore).toBe(14);
  });

  it("starts a fresh pool after a certificate expires and keeps the old stars", () => {
    const events = starEvents(
      [
        { user_id: U, course_id: C, score: 75, passed: true, questions: 20, submitted_at: "2025-06-01T10:00:00Z" },
        { user_id: U, course_id: C, score: 80, passed: true, questions: 20, submitted_at: "2026-06-05T10:00:00Z" },
        { user_id: U, course_id: C, score: 75, passed: true, questions: 20, submitted_at: "2026-06-12T10:00:00Z" },
      ],
      [{ user_id: U, course_id: C, expires_at: "2026-06-01T10:00:00Z" }],
      [],
    );
    expect(events.map((e) => [e.delta, e.outcome, e.cycle])).toEqual([
      [15, "first", 1],
      [16, "renewal", 2],
      [0, "no_gain", 2],
    ]);
    const s = summarise(U, events, { start: null, previous: null });
    expect(s.total).toBe(31);
    expect(s.renewals).toBe(1);
    expect(s.coursesPassed).toBe(1);
  });

  it("agrees with the learner's own star bank", () => {
    const attempts = [
      { user_id: U, course_id: C, score: 50, passed: false, questions: 20, submitted_at: "2025-05-01T10:00:00Z" },
      { user_id: U, course_id: C, score: 90, passed: true, questions: 20, submitted_at: "2025-05-02T10:00:00Z" },
      { user_id: U, course_id: C, score: 100, passed: true, questions: 20, submitted_at: "2026-07-01T10:00:00Z" },
      { user_id: U, course_id: "course-b", score: 60, passed: false, questions: 20, submitted_at: "2026-07-03T10:00:00Z" },
    ];
    const certs = [{ user_id: U, course_id: C, expires_at: "2026-05-02T10:00:00Z" }];
    const events = starEvents(attempts, certs, []);
    const console_ = summarise(U, events, { start: null, previous: null }).assessment;
    const learner = computeStarTotal(
      attempts.map((a) => ({ course_id: a.course_id, score: a.score, question_ids: new Array(a.questions).fill("q"), submitted_at: a.submitted_at })),
      certs.map((c) => ({ course_id: c.course_id, expires_at: c.expires_at })),
    );
    expect(console_).toBe(learner);
    expect(console_).toBe(18 + 20 + 12);
  });

  it("groups questions along the way by course and UK day", () => {
    const events = starEvents(
      [],
      [],
      [
        { user_id: U, course_id: C, awarded_at: "2026-10-21T08:00:00Z" },
        { user_id: U, course_id: C, awarded_at: "2026-10-21T09:30:00Z" },
        { user_id: U, course_id: C, awarded_at: "2026-10-21T23:30:00Z" }, // 00:30 on the 22nd in the UK (BST)
        { user_id: U, course_id: "course-b", awarded_at: "2026-10-21T09:00:00Z" },
      ],
    );
    expect(events.map((e) => [e.courseId, e.count])).toEqual([
      [C, 2],
      ["course-b", 1],
      [C, 1],
    ]);
  });

  it("splits gains into this period and the one before", () => {
    const events = starEvents(
      [
        { user_id: U, course_id: C, score: 70, passed: true, questions: 20, submitted_at: "2026-08-10T10:00:00Z" },
        { user_id: U, course_id: "course-b", score: 90, passed: true, questions: 20, submitted_at: "2026-10-28T10:00:00Z" },
      ],
      [],
      [],
    );
    const bounds = periodBounds("quarter", new Date("2026-11-01T12:00:00Z"));
    expect(new Date(bounds.start!).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(new Date(bounds.previous!).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    const s = summarise(U, events, bounds);
    expect(s.gain).toBe(18);
    expect(s.previousGain).toBe(14);
    expect(s.lastStarAt).toBe("2026-10-28T10:00:00Z");
  });

  it("builds a 12-month series and a by-course table", () => {
    const events = starEvents(
      [
        { user_id: U, course_id: C, score: 70, passed: true, questions: 20, submitted_at: "2026-08-10T10:00:00Z" },
        { user_id: U, course_id: C, score: 90, passed: true, questions: 20, submitted_at: "2026-10-28T10:00:00Z" },
      ],
      [],
      [{ user_id: U, course_id: C, awarded_at: "2026-10-21T08:00:00Z" }],
    );
    const series = monthlySeries(events, new Date("2026-11-01T12:00:00Z"));
    expect(series).toHaveLength(12);
    expect(series[0].month).toBe("2025-12");
    expect(series.find((m) => m.month === "2026-08")?.stars).toBe(14);
    expect(series.find((m) => m.month === "2026-10")?.stars).toBe(5);
    const courses = byCourse(events);
    expect(courses).toEqual([{ courseId: C, best: 18, questions: 20, stars: 19, cycle: 1, attempts: 2, passed: true, content: 1 }]);
  });
});
