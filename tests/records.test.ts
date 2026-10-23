import { describe, expect, it } from "vitest";
import {
  MAX_AGREED_ACTIONS,
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
