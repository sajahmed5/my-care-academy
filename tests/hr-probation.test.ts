import { describe, expect, it } from "vitest";
import { outcomeProblems, reviewPoints, sanitiseProbation, schedule, DEFAULT_PROBATION } from "../lib/hr/probation";
import { probationDue } from "../lib/hr/probation-due";
import { draftLetter, merge, sanitiseOverrides, templateInForce, unfilled } from "../lib/hr/letters";

const emp = (over: Record<string, unknown> = {}) => ({ start_date: "2026-05-01", probation_status: "in_probation", probation_ends_on: "2026-11-01", ...over });

describe("probation settings", () => {
  it("keep reviews inside the probation, sorted, and always the end", () => {
    expect(sanitiseProbation({ months: 6, reviewMonths: [3, 1, 6, 9, 1] })).toEqual({ months: 6, reviewMonths: [1, 3, 6] });
    expect(sanitiseProbation({ months: 0, reviewMonths: [] })).toEqual({ months: 6, reviewMonths: [6] });
  });
});

describe("the review points", () => {
  it("fall 1 and 3 months in, and at the end", () => {
    expect(reviewPoints(emp(), DEFAULT_PROBATION).map((p) => [p.dueOn, p.isFinal])).toEqual([
      ["2026-06-01", false],
      ["2026-08-01", false],
      ["2026-11-01", true],
    ]);
  });
  it("are none without a start date", () => {
    expect(reviewPoints(emp({ start_date: null }), DEFAULT_PROBATION)).toEqual([]);
  });
  it("keep the held final review and add one at the new end after an extension", () => {
    const pts = reviewPoints(emp({ probation_ends_on: "2027-01-01", probation_status: "extended" }), DEFAULT_PROBATION, ["2026-11-01"]);
    expect(pts.map((p) => [p.dueOn, p.label])).toEqual([
      ["2026-06-01", "1-month review"],
      ["2026-08-01", "3-month review"],
      ["2026-11-01", "End of probation review"],
      ["2027-01-01", "End of extended probation"],
    ]);
  });
});

describe("who's due", () => {
  const people = [
    { id: "a", name: "Ann" },
    { id: "b", name: "Bob" },
    { id: "c", name: "Cat" },
  ];
  it("lists the next review, and anyone with no start date, leaving out who has finished", () => {
    const rows = probationDue(
      people,
      [
        { user_id: "a", ...emp() },
        { user_id: "c", ...emp({ probation_status: "passed" }) },
      ] as never,
      [{ id: "r1", user_id: "a", due_on: "2026-06-01", status: "held", booked_on: null, booked_time: null, held_on: "2026-06-02", outcome: "on_track", is_final: false }],
      DEFAULT_PROBATION,
      "2026-08-10",
    );
    expect(rows.map((r) => [r.person.name, r.group, r.next?.dueOn ?? null])).toEqual([
      ["Ann", "overdue", "2026-08-01"],
      ["Bob", "no_start", null],
    ]);
  });
  it("shows a booked review as booked", () => {
    const lines = schedule(emp(), DEFAULT_PROBATION, [{ id: "r", due_on: "2026-06-01", status: "booked", booked_on: "2026-06-03", booked_time: null, held_on: null, outcome: null, is_final: false }], "2026-05-20");
    expect(lines[0].state).toBe("booked");
    expect(lines[1].state).toBe("later");
  });
  it("stops chasing an earlier review once a later one is held", () => {
    const lines = schedule(emp(), DEFAULT_PROBATION, [{ id: "r", due_on: "2026-08-01", status: "held", booked_on: null, booked_time: null, held_on: "2026-08-02", outcome: "on_track", is_final: false }], "2026-08-10");
    expect(lines.map((l) => l.state)).toEqual(["skipped", "held", "later"]);
  });
});

describe("the outcome", () => {
  it("asks how long and why for an extension, and why for not passed", () => {
    expect(outcomeProblems({ isFinal: true, outcome: "extended", extendMonths: null, reason: "" })).toHaveLength(2);
    expect(outcomeProblems({ isFinal: true, outcome: "not_passed", extendMonths: null, reason: "Missed visits" })).toEqual([]);
    expect(outcomeProblems({ isFinal: false, outcome: "passed", extendMonths: null, reason: "" })).toEqual(["Choose the outcome."]);
  });
});

describe("letters", () => {
  it("fill in what is known and drop what is empty", () => {
    expect(merge("Dear {{firstName}},\n\n{{details}}\n\nThanks", { firstName: "Ann" })).toBe("Dear Ann,\n\nThanks");
  });
  it("use the company's wording but always keep the right to appeal", () => {
    const t = templateInForce("probation_not_passed", sanitiseOverrides({ probation_not_passed: { body: "Sorry, {{firstName}}." }, nonsense: { body: "x" } }))!;
    const d = draftLetter(t, { firstName: "Ann", deadline: "5 November 2026" });
    expect(d.body).toBe("Sorry, Ann.");
    expect(d.fixed[0]).toContain("right to appeal");
    expect(d.fixed[0]).toContain("5 November 2026");
  });
  it("find fields left in brackets", () => {
    expect(unfilled("Hello {{firstName}} and {{ reason }}")).toEqual(["firstName", "reason"]);
  });
});
