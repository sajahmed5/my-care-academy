import { describe, expect, it } from "vitest";
import { absenceDue, bradford, daysOff, needsFitNote, rtwDueOn, rtwFlags, sanitiseTriggers, welfareDueOn, type Absence } from "../lib/hr/absence";

const today = "2026-10-30";
const ab = (over: Partial<Absence>): Absence => ({
  id: "a",
  user_id: "u",
  start_date: "2026-10-01",
  returned_on: "2026-10-03",
  reason: "Cold, flu or COVID-19",
  certification: "self",
  fit_note_until: null,
  excluded_from_triggers: false,
  rtw_status: "held",
  ...over,
});

describe("days off", () => {
  it("count from the start to the day before they came back, or to today", () => {
    expect(daysOff(ab({}), today)).toBe(2);
    expect(daysOff(ab({ start_date: "2026-10-28", returned_on: null }), today)).toBe(3);
  });
  it("need a fit note after 7 days", () => {
    expect(needsFitNote(ab({ start_date: "2026-10-20", returned_on: null }), today)).toBe(true);
    expect(needsFitNote(ab({ start_date: "2026-10-20", returned_on: null, certification: "fit_note" }), today)).toBe(false);
    expect(needsFitNote(ab({}), today)).toBe(false);
  });
});

describe("return to work", () => {
  it("is due 3 days after the first day back", () => {
    expect(rtwDueOn(ab({}))).toBe("2026-10-06");
    expect(rtwDueOn(ab({ returned_on: null }))).toBeNull();
  });
  it("flags someone back too soon after sickness and diarrhoea", () => {
    expect(rtwFlags({ dv48: "No" })[0]).toContain("48 hours");
    expect(rtwFlags({ dv48: "Yes", fitForDuties: "yes" })).toEqual([]);
  });
});

describe("welfare meetings", () => {
  it("fall due 4 weeks in, then every 4 weeks, only while still off", () => {
    const long = ab({ start_date: "2026-09-01", returned_on: null });
    expect(welfareDueOn(long, [], today)).toBe("2026-09-29");
    expect(welfareDueOn(long, ["2026-10-01"], today)).toBe("2026-10-29");
    expect(welfareDueOn(ab({ start_date: "2026-10-20", returned_on: null }), [], today)).toBeNull();
    expect(welfareDueOn(ab({ start_date: "2026-09-01", returned_on: "2026-10-20" }), [], today)).toBeNull();
  });
});

describe("the Bradford Factor", () => {
  it("is spells squared times days over 52 weeks, leaving out excluded and older spells", () => {
    const list = [
      ab({ id: "1", start_date: "2026-10-01", returned_on: "2026-10-03" }), // 2 days
      ab({ id: "2", start_date: "2026-06-01", returned_on: "2026-06-04" }), // 3 days
      ab({ id: "3", start_date: "2026-03-01", returned_on: "2026-03-06" }), // 5 days
      ab({ id: "4", start_date: "2026-05-01", returned_on: "2026-05-30", excluded_from_triggers: true }),
      ab({ id: "5", start_date: "2025-09-01", returned_on: "2025-09-10" }),
    ];
    expect(bradford(list, today, [51, 201, 401])).toEqual({ spells: 3, days: 10, score: 90, reached: 51 });
  });
  it("keeps trigger points sane", () => {
    expect(sanitiseTriggers(["201", 51, -3, 51])).toEqual([51, 201]);
    expect(sanitiseTriggers([])).toEqual([51, 201, 401]);
  });
});

describe("across the company", () => {
  it("lists who's off, interviews due, and who has reached a trigger, current staff only", () => {
    const list = [
      ab({ id: "off", user_id: "a", start_date: "2026-10-29", returned_on: null, rtw_status: "none" }),
      ab({ id: "rtw", user_id: "b", start_date: "2026-10-20", returned_on: "2026-10-28", rtw_status: "none" }),
      ab({ id: "gone", user_id: "z", start_date: "2026-10-29", returned_on: null }),
    ];
    const due = absenceDue(list, [], [5], today, new Set(["a", "b"]));
    expect(due.off.map((a) => a.id)).toEqual(["off"]);
    expect(due.rtw.map((a) => [a.id, a.dueOn, a.late])).toEqual([["rtw", "2026-10-31", false]]);
    expect(due.triggers.map((t) => [t.userId, t.score])).toEqual([["b", 8]]);
  });
});
