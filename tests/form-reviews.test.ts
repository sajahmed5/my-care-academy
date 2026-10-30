import { describe, expect, it } from "vitest";
import { addMonths, cleanReviewDue, defaultReviewDue, reviewHref, reviewRows, type ReviewRecord } from "@/lib/form-reviews";

const now = new Date("2026-10-30T10:00:00Z");

const rec = (over: Partial<ReviewRecord>): ReviewRecord => ({
  id: "r1",
  templateId: "t1",
  templateCode: "RA",
  templateTitle: "Risk assessment",
  subject: "client",
  clientId: "c1",
  clientName: "Jane",
  userId: "u1",
  userName: "Sam",
  submittedAt: "2026-01-01T10:00:00Z",
  reviewDue: "2026-12-01",
  ...over,
});

describe("addMonths", () => {
  it("moves a date on by months, clamped to the month's end", () => {
    expect(addMonths("2026-10-30", 12)).toBe("2027-10-30");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("review dates", () => {
  it("start from the form's period, or none", () => {
    expect(defaultReviewDue(now, 6)).toBe("2027-04-30");
    expect(defaultReviewDue(now, null)).toBeNull();
  });

  it("accept a real date from today to five years on", () => {
    expect(cleanReviewDue("2027-01-15", now)).toBe("2027-01-15");
    expect(cleanReviewDue("2026-10-29", now)).toBeNull();
    expect(cleanReviewDue("2032-01-01", now)).toBeNull();
    expect(cleanReviewDue("2027-02-30", now)).toBeNull();
    expect(cleanReviewDue("", now)).toBeNull();
  });
});

describe("reviewRows", () => {
  it("keeps the latest record for each form and client", () => {
    const rows = reviewRows(
      [
        rec({ id: "old", submittedAt: "2025-01-01T00:00:00Z", reviewDue: "2026-01-01" }),
        rec({ id: "new", submittedAt: "2026-06-01T00:00:00Z", reviewDue: "2026-11-15" }),
        rec({ id: "other", clientId: "c2", reviewDue: "2027-06-01" }),
      ],
      now,
    );
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["new", "due_soon"],
      ["other", "scheduled"],
    ]);
  });

  it("drops a form whose latest record has no review date", () => {
    const rows = reviewRows(
      [rec({ id: "old", reviewDue: "2026-01-01" }), rec({ id: "new", submittedAt: "2026-09-01T00:00:00Z", reviewDue: null })],
      now,
    );
    expect(rows).toEqual([]);
  });

  it("marks a passed date overdue, and keeps the company's and each carer's apart", () => {
    const rows = reviewRows(
      [
        rec({ id: "bcp", subject: "company", clientId: null, reviewDue: "2026-10-01" }),
        rec({ id: "a", subject: "carer", clientId: null, userId: "u1", reviewDue: "2027-01-01" }),
        rec({ id: "b", subject: "carer", clientId: null, userId: "u2", reviewDue: "2027-01-01" }),
      ],
      now,
    );
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["bcp", "overdue"],
      ["a", "scheduled"],
      ["b", "scheduled"],
    ]);
  });

  it("forgets a client removed from the list", () => {
    expect(reviewRows([rec({ clientId: null })], now)).toEqual([]);
  });
});

describe("reviewHref", () => {
  it("opens the form again from the record, or asks a carer again", () => {
    expect(reviewHref({ id: "r1", templateCode: "RA", subject: "client", clientId: "c1" })).toBe("/org/forms/fill/RA?client=c1&review=r1");
    expect(reviewHref({ id: "r1", templateCode: "BCP", subject: "company", clientId: null })).toBe("/org/forms/fill/BCP?review=r1");
    expect(reviewHref({ id: "r1", templateCode: "X", subject: "carer", clientId: null })).toBe("/org/forms/library/X");
  });
});
