import { describe, expect, it } from "vitest";
import { buildClientHistory, qaAverages, type HistoryInput } from "../lib/client-history";

const input: HistoryInput = {
  qas: [
    {
      id: "q1",
      held_on: "2026-09-01",
      completed: true,
      method: "visit",
      score: 90,
      review_status: "not_needed",
      ratings: { safe: 9, effective: 9, caring: 9, responsive: 9, well_led: 9 },
    },
    { id: "q2", held_on: "2026-10-01", completed: false, method: "phone", score: null, review_status: "not_needed", ratings: {} },
    {
      id: "q3",
      held_on: "2026-06-01",
      completed: true,
      method: "phone",
      score: 60,
      review_status: "waiting",
      ratings: { safe: 5, effective: 6, caring: 7, responsive: 4, well_led: 8 },
    },
  ],
  audits: [{ id: "a1", title: "Medication audit", held_on: "2026-10-15", score: 100, review_status: "not_needed" }],
  spotChecks: [{ id: "s1", userId: "u1", checked_on: "2026-08-01", outcome: "developing", outcomeLabel: "Some concerns", carer: "Ann" }],
  concerns: [
    { id: "c1", reference: "CMP-1", kindLabel: "Complaint", statusLabel: "Closed", status: "closed", reported_on: "2026-07-01", description: "Late" },
    { id: "c2", reference: "SAF-1", kindLabel: "Safeguarding concern", statusLabel: "Open", status: "open", reported_on: "2026-10-20", description: "Bruise" },
  ],
  compliments: [{ id: "k1", receivedOn: "2026-05-01", whatWasSaid: "Lovely", people: ["Bob"] }],
  reviewBelow: 80,
};

describe("a client over time", () => {
  const h = buildClientHistory(input);

  it("puts everything in one list, newest first", () => {
    expect(h.map((e) => e.kind)).toEqual(["concern", "audit", "qa", "qa", "spot_check", "concern", "qa", "compliment"]);
    expect(h[0].href).toBe("/org/complaints/c2");
    expect(h[4].href).toBe("/org/staff/u1?section=competency");
  });

  it("flags what needs looking at", () => {
    const flagged = h.filter((e) => e.flag).map((e) => e.title);
    expect(flagged).toEqual(["Safeguarding concern SAF-1", "Spot check of Ann", "Client QA by phone"]);
  });

  it("describes a QA by its ratings, and one that couldn't be done as such", () => {
    expect(h.find((e) => e.href === "/org/audits/qa/q1")?.detail).toBe("Safe 9 · Effective 9 · Caring 9 · Responsive 9 · Well-led 9 · 90%");
    expect(h.find((e) => e.href === "/org/audits/qa/q2")?.title).toBe("Client QA — couldn't be done");
  });

  it("averages each heading across the QAs that were done", () => {
    expect(qaAverages(input.qas)).toEqual({ safe: 7, effective: 7.5, caring: 8, responsive: 6.5, well_led: 8.5 });
  });
});
