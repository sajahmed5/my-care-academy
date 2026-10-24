import { describe, it, expect } from "vitest";
import { pipSteps } from "../lib/pips/steps";
import { weeksFor } from "../lib/pips/plan";

// Ported from myroster tests/unit/pipSteps.test.ts.
const weeks = (done: number) => [
  { weekNumber: 1, periodStart: "2026-09-14", periodEnd: "2026-09-20" },
  { weekNumber: 2, periodStart: "2026-09-21", periodEnd: "2026-09-27" },
  { weekNumber: 3, periodStart: "2026-09-28", periodEnd: "2026-10-04" },
].map((w, i) => ({ ...w, completedAt: i < done ? "2026-09-30T10:00:00Z" : null }));
const plan = (over = {}) => ({ status: "open", carerName: "Noor Ilyas", reviewUntil: "2026-10-04", carerSignedAt: null, reviews: weeks(0), ...over });

describe("the next thing to do on a plan", () => {
  it("puts an overdue week before the signature", () => {
    const { next, steps } = pipSteps(plan(), "2026-09-23");
    expect(next).toEqual({ step: "reviews", late: true, text: "Review week 1. It ended Sun 20 Sept." });
    expect(steps.map((s) => s.state)).toEqual(["done", "todo", "current", "todo"]);
  });

  it("asks for the carer's signature when no review is owed", () => {
    const { next } = pipSteps(plan(), "2026-09-16");
    expect(next.text).toBe("Get Noor's signature — in their app, or in person at the office.");
    expect(next.late).toBeUndefined();
  });

  it("says when the running week is due once the plan is signed", () => {
    const { next, steps } = pipSteps(plan({ carerSignedAt: "2026-09-15T09:00:00Z", reviews: weeks(1) }), "2026-09-23");
    expect(next.text).toBe("Week 2 runs to Sun 27 Sept. Review it then.");
    expect(steps.find((s) => s.key === "reviews")?.detail).toBe("1 of 3");
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
  });

  it("asks for the outcome when every week is reviewed, and flags it once the plan's end has passed", () => {
    const p = plan({ carerSignedAt: "2026-09-15T09:00:00Z", reviews: weeks(3) });
    expect(pipSteps(p, "2026-10-04").next).toEqual({ step: "outcome", late: false, text: "Every week is reviewed. Close the plan with its outcome." });
    expect(pipSteps(p, "2026-10-12").next.late).toBe(true);
  });

  it("a plan with no weeks asks for the first one", () => {
    expect(pipSteps(plan({ carerSignedAt: "x", reviews: [] }), "2026-09-16").next.text).toMatch(/^Add the first week/);
  });

  it("a finished plan says how it ended, and a cancelled one says so", () => {
    const fin = pipSteps(plan({ status: "completed", outcome: "partially_met", carerSignedAt: "x", reviews: weeks(3) }), "2026-10-12");
    expect(fin.next.text).toBe("Finished — partially met.");
    expect(fin.steps.every((s) => s.state === "done")).toBe(true);
    const can = pipSteps(plan({ status: "cancelled" }), "2026-10-12");
    expect(can.next.text).toBe("This plan was cancelled.");
    expect(can.steps.some((s) => s.state === "current")).toBe(false);
  });
});

describe("the weeks of a plan", () => {
  it("runs seven days each from the start date, back to back", () => {
    expect(weeksFor("2026-09-14", 3)).toEqual([
      { weekNumber: 1, periodStart: "2026-09-14", periodEnd: "2026-09-20" },
      { weekNumber: 2, periodStart: "2026-09-21", periodEnd: "2026-09-27" },
      { weekNumber: 3, periodStart: "2026-09-28", periodEnd: "2026-10-04" },
    ]);
  });
});
