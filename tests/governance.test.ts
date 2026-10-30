import { describe, expect, it } from "vitest";
import {
  governancePrompt,
  monthRange,
  previousMonth,
  recentMonths,
  summariseActions,
  summariseAudits,
  summariseConcerns,
  summariseQas,
  type GovernanceReport,
} from "../lib/governance";

const oct = monthRange("2026-10")!;

describe("months", () => {
  it("reads a month and knows its last day", () => {
    expect(oct).toEqual({ month: "2026-10", start: "2026-10-01", end: "2026-10-31", label: "October 2026" });
    expect(monthRange("2028-02")?.end).toBe("2028-02-29");
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("Oct")).toBeNull();
  });
  it("offers last month first, and the months before", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(previousMonth(now)).toBe("2025-12");
    expect(recentMonths(now, 3).map((m) => m.month)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

describe("the month's figures", () => {
  it("counts the month's audits by form, with their average", () => {
    const s = summariseAudits(
      [
        { title: "Medication audit", about: "Ann", held_on: "2026-10-03", score: 80, review_status: "not_needed" },
        { title: "Medication audit", about: "Bob", held_on: "2026-10-20", score: 61, review_status: "waiting" },
        { title: "Care plan audit", about: "Ann", held_on: "2026-09-30", score: 50, review_status: "waiting" },
      ],
      oct,
      [
        { title: "Client QA", count: 3 },
        { title: "Infection control", count: 0 },
      ],
    );
    expect(s.done).toHaveLength(2);
    expect(s.byForm).toEqual([{ title: "Medication audit", count: 2, average: 71 }]);
    expect(s.waitingReview).toBe(2);
    expect(s.behind).toEqual([{ title: "Client QA", count: 3 }]);
  });

  it("averages QA ratings by heading over the QAs done", () => {
    const s = summariseQas(
      [
        { client_name: "Ann", held_on: "2026-10-01", completed: true, score: 90, safe: 9, effective: 9, caring: 9, responsive: 9, well_led: 9 },
        { client_name: "Bob", held_on: "2026-10-02", completed: true, score: 60, safe: 6, effective: 6, caring: 6, responsive: 6, well_led: 6 },
        { client_name: "Cy", held_on: "2026-10-03", completed: false, score: null },
        { client_name: "Di", held_on: "2026-11-01", completed: true, score: 10, safe: 1, effective: 1, caring: 1, responsive: 1, well_led: 1 },
      ],
      oct,
      80,
    );
    expect(s).toMatchObject({ done: 2, attempted: 1, score: 75 });
    expect(s.averages.safe).toBe(7.5);
    expect(s.low).toEqual([{ client: "Bob", heldOn: "2026-10-02", score: 60 }]);
  });

  it("counts the actions open at the month's end, not today", () => {
    const s = summariseActions(
      [
        { title: "A", owner: "X", due_date: "2026-10-10", source_type: "audit", created_at: "2026-10-01T09:00:00Z", completed_at: null },
        { title: "B", owner: "X", due_date: null, source_type: "client_qa", created_at: "2026-10-05T09:00:00Z", completed_at: "2026-11-02T09:00:00Z" },
        { title: "C", owner: "X", due_date: null, source_type: "audit", created_at: "2026-10-05T09:00:00Z", completed_at: "2026-10-06T09:00:00Z" },
        { title: "D", owner: "X", due_date: null, source_type: "audit", created_at: "2026-11-05T09:00:00Z", completed_at: null },
      ],
      oct,
    );
    expect(s.open).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.bySource).toEqual([
      { label: "Audits", open: 1, overdue: 1 },
      { label: "Client QAs", open: 1, overdue: 0 },
    ]);
    expect(s.overdueList).toEqual([{ title: "A", owner: "X", due: "2026-10-10" }]);
  });

  it("counts concerns raised and closed in the month, and compliments", () => {
    const s = summariseConcerns(
      [
        { kind: "safeguarding", kindLabel: "Safeguarding concern", reported_on: "2026-10-02", closed_on: null, status: "open" },
        { kind: "complaint", kindLabel: "Complaint", reported_on: "2026-09-02", closed_on: "2026-10-10", status: "closed" },
      ],
      [{ received_on: "2026-10-09" }, { received_on: "2026-09-09" }],
      oct,
    );
    expect(s).toEqual({ raised: 1, byKind: [{ label: "Safeguarding concern", count: 1 }], safeguarding: 1, closed: 1, openNow: 1, compliments: 1 });
  });
});

describe("the AI summary", () => {
  const report: GovernanceReport = {
    organisationName: "Acme Care",
    range: oct,
    reviewBelow: 80,
    summary: "",
    audits: {
      done: [{ title: "Medication audit", about: "Ann Smith", heldOn: "2026-10-03", score: 70, review: "waiting" }],
      byForm: [{ title: "Medication audit", count: 1, average: 70 }],
      waitingReview: 1,
      behind: [],
    },
    qas: { done: 1, attempted: 0, averages: { safe: 8, effective: 8, caring: 8, responsive: 8, well_led: 8 }, score: 80, low: [{ client: "Bob Jones", heldOn: "2026-10-04", score: 60 }] },
    actions: { open: 1, overdue: 1, bySource: [{ label: "Audits", open: 1, overdue: 1 }], overdueList: [{ title: "Fix Ann Smith's MAR", owner: "Carol White", due: "2026-10-10" }] },
    concerns: null,
    staffAudits: null,
    training: { compliance: 90, people: 10, upToDate: 9, behind: [{ name: "Dan Brown", detail: "1 overdue" }] },
  };

  it("is asked from the figures, and never sent anyone's name", () => {
    const p = governancePrompt(report);
    expect(p).toContain("October 2026");
    expect(p).toContain("Medication audit: 1, average 70%");
    expect(p).toContain("Training compliance (assigned courses completed and in date): 90%");
    for (const name of ["Ann Smith", "Bob Jones", "Carol White", "Dan Brown", "Fix Ann"]) expect(p).not.toContain(name);
  });
});
