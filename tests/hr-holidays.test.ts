import { describe, expect, it } from "vitest";
import { OUR_LEAVE_TYPES, balance, canApprove, clashes, leaveYear, sanitiseLeaveTypes, suggestDays, type LeaveRequest } from "../lib/hr/holidays";

const req = (over: Partial<LeaveRequest>): LeaveRequest => ({
  id: "r",
  user_id: "u",
  leave_type: "annual",
  start_date: "2026-11-02",
  end_date: "2026-11-06",
  amount: 5,
  unit: "days",
  status: "approved",
  ...over,
});

describe("the leave year", () => {
  it("runs from the company's start day", () => {
    expect(leaveYear("2026-10-30", "01-01")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(leaveYear("2026-03-31", "04-01")).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(leaveYear("2026-04-01", "04-01")).toEqual({ start: "2026-04-01", end: "2027-03-31" });
  });
});

describe("the suggested amount", () => {
  it("counts weekdays, and bank holidays only when they come out of the allowance", () => {
    // Christmas week 2026: 25th (Fri) and 28th (Mon) are bank holidays.
    expect(suggestDays("2026-12-21", "2026-12-28", true)).toBe(6);
    expect(suggestDays("2026-12-21", "2026-12-28", false)).toBe(4);
    expect(suggestDays("2026-11-07", "2026-11-08", true)).toBe(0);
  });
});

describe("the balance", () => {
  it("counts approved leave from the allowance as taken or booked, and requests as waiting", () => {
    const b = balance(
      { amount: 28, unit: "days" },
      [
        req({ id: "1", start_date: "2026-08-03", end_date: "2026-08-07", amount: 5 }),
        req({ id: "2", start_date: "2026-11-02", amount: 5 }),
        req({ id: "3", start_date: "2026-12-21", amount: 4, status: "requested" }),
        req({ id: "4", leave_type: "unpaid", start_date: "2026-09-01", amount: 3 }),
        req({ id: "5", start_date: "2025-12-01", amount: 2 }),
        req({ id: "6", start_date: "2026-07-01", amount: 1, status: "declined" }),
      ],
      leaveYear("2026-10-30", "01-01"),
      OUR_LEAVE_TYPES,
      "2026-10-30",
    );
    expect(b).toEqual({ allowance: 28, unit: "days", taken: 5, booked: 5, pending: 4, left: 18 });
  });
});

describe("clashes", () => {
  it("name who else is off and the busiest day", () => {
    const c = clashes(req({ id: "new", user_id: "me" }), [
      req({ id: "a", user_id: "a", start_date: "2026-11-04", end_date: "2026-11-10" }),
      req({ id: "b", user_id: "b", start_date: "2026-11-05", end_date: "2026-11-05" }),
      req({ id: "c", user_id: "c", start_date: "2026-11-20", end_date: "2026-11-21" }),
    ]);
    expect(c).toEqual({ others: ["a", "b"], busiest: 3 });
  });
});

describe("who approves", () => {
  it("managers and office approve carers; only managers approve office staff; nobody their own", () => {
    expect(canApprove({ id: "o", role: "org_office" }, { id: "c", role: "learner" })).toBe(true);
    expect(canApprove({ id: "o", role: "org_office" }, { id: "o2", role: "org_office" })).toBe(false);
    expect(canApprove({ id: "m", role: "org_admin" }, { id: "o2", role: "org_office" })).toBe(true);
    expect(canApprove({ id: "m", role: "org_admin" }, { id: "m", role: "org_admin" })).toBe(false);
    expect(canApprove({ id: "c", role: "learner" }, { id: "c2", role: "learner" })).toBe(false);
  });
});

describe("the company's own kinds of leave", () => {
  it("keep only well-formed ones", () => {
    expect(sanitiseLeaveTypes([{ key: "own_abc123", label: " Jury service ", fromAllowance: false }, { key: "annual", label: "x" }, { label: "no key" }])).toEqual([
      { key: "own_abc123", label: "Jury service", fromAllowance: false },
    ]);
  });
});
