import { describe, expect, it } from "vitest";
import { isPastRetention, keptUntil, retentionCutoff } from "../lib/retention";

const now = new Date("2026-10-26T12:00:00Z");

describe("7-year retention", () => {
  it("cuts off seven years before today", () => {
    expect(retentionCutoff(now)).toBe("2019-10-26");
  });
  it("is past only for a date more than seven years ago", () => {
    expect(isPastRetention("2019-10-25", now)).toBe(true);
    expect(isPastRetention("2019-10-26T09:00:00Z", now)).toBe(false);
    expect(isPastRetention("2024-01-01", now)).toBe(false);
  });
  it("never counts a record with no end date — current staff, open records", () => {
    expect(isPastRetention(null, now)).toBe(false);
    expect(isPastRetention(undefined, now)).toBe(false);
  });
  it("says when a record may go", () => {
    expect(keptUntil("2026-03-01")).toBe("2033-03-01");
  });
});
