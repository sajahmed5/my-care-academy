import { describe, expect, it } from "vitest";
import {
  MAX_AGREED_ACTIONS,
  addMonths,
  defaultNextDue,
  dueStatus,
  parseAgreedActions,
} from "../lib/records";

const NOW = new Date("2026-10-23T12:00:00Z");

describe("dueStatus", () => {
  it("says nothing is scheduled rather than inventing a date", () => {
    expect(dueStatus(null, NOW)).toBe("none");
  });

  it("flags a date that has passed", () => {
    expect(dueStatus("2026-10-01", NOW)).toBe("overdue");
  });

  it("separates the next 30 days from what is further out", () => {
    expect(dueStatus("2026-11-10", NOW)).toBe("due_soon");
    expect(dueStatus("2027-04-01", NOW)).toBe("scheduled");
  });
});

describe("parseAgreedActions", () => {
  it("takes one action per line", () => {
    expect(parseAgreedActions("Book moving and handling\nChase the DBS")).toEqual([
      "Book moving and handling",
      "Chase the DBS",
    ]);
  });

  it("tidies up what people actually paste", () => {
    expect(parseAgreedActions("- Book training\n\n  * Chase DBS  \n•Order gloves")).toEqual([
      "Book training",
      "Chase DBS",
      "Order gloves",
    ]);
  });

  it("is empty for an empty box", () => {
    expect(parseAgreedActions("")).toEqual([]);
    expect(parseAgreedActions("\n\n   \n")).toEqual([]);
  });

  it("stops at a sane number of actions", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Action ${i}`).join("\n");
    expect(parseAgreedActions(many)).toHaveLength(MAX_AGREED_ACTIONS);
  });

  it("trims an over-long line rather than dropping it", () => {
    const [only] = parseAgreedActions("x".repeat(500));
    expect(only).toHaveLength(200);
  });
});

describe("addMonths", () => {
  it("keeps the same day of the month", () => {
    expect(addMonths("2026-10-23", 3)).toBe("2027-01-23");
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
  });

  it("clamps to the end of a shorter month rather than rolling over", () => {
    // The trap: JS Date turns 31 Jan + 1 month into 3 March, which would
    // schedule a supervision into the following month.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-08-31", 3)).toBe("2026-11-30");
  });

  it("crosses a year end", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("handles a leap year", () => {
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("leaves a malformed date alone", () => {
    expect(addMonths("", 3)).toBe("");
    expect(addMonths("not-a-date", 3)).toBe("not-a-date");
  });
});

describe("defaultNextDue", () => {
  it("uses three months for the quarterly reviews", () => {
    expect(defaultNextDue("2026-10-23", "supervision")).toBe("2027-01-23");
    expect(defaultNextDue("2026-10-23", "competency")).toBe("2027-01-23");
    expect(defaultNextDue("2026-10-23", "client_qa")).toBe("2027-01-23");
  });

  it("uses six months for satisfaction, and for anything else", () => {
    expect(defaultNextDue("2026-10-23", "carer_satisfaction")).toBe("2027-04-23");
    expect(defaultNextDue("2026-10-23", "other")).toBe("2027-04-23");
  });
});
