import { describe, expect, it } from "vitest";
import {
  canCancelBooking,
  nextUkDay,
  sessionTitle,
  sessionWhen,
  ukDay,
  ukLocalToDate,
  ukTime,
} from "../lib/face-to-face";
import { bookingEmail } from "../lib/face-to-face-email";

/**
 * Face-to-face sessions are typed in UK time and stored as instants. The
 * server runs in UTC, so the dates either side of the clocks changing are the
 * ones that go wrong if the offset is assumed rather than read.
 */
describe("UK times for face-to-face sessions", () => {
  it("reads 9:30 in British summer time as 08:30 UTC", () => {
    expect(ukLocalToDate("2026-07-01", "09:30")?.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("reads 9:30 in winter as 09:30 UTC", () => {
    expect(ukLocalToDate("2026-11-05", "09:30")?.toISOString()).toBe("2026-11-05T09:30:00.000Z");
  });

  it("gets the days the clocks change right", () => {
    // 25 Oct 2026: clocks go back at 02:00 BST. 10:00 is GMT.
    expect(ukLocalToDate("2026-10-25", "10:00")?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
    // 29 Mar 2026: clocks go forward at 01:00 GMT. 10:00 is BST.
    expect(ukLocalToDate("2026-03-29", "10:00")?.toISOString()).toBe("2026-03-29T09:00:00.000Z");
  });

  it("refuses what isn't a date and time", () => {
    expect(ukLocalToDate("2026-02-30", "09:00")).toBeNull();
    expect(ukLocalToDate("5/11/2026", "09:00")).toBeNull();
    expect(ukLocalToDate("2026-11-05", "25:00")).toBeNull();
  });

  it("writes the day and time back in UK time", () => {
    expect(ukDay("2026-07-01T23:30:00Z")).toBe("2026-07-02");
    expect(ukTime("2026-07-01T08:30:00Z")).toBe("09:30");
    expect(sessionWhen("2026-11-05T09:30:00Z", "2026-11-05T12:30:00Z")).toBe(
      "Thursday 5 November 2026, 09:30 to 12:30",
    );
  });

  it("steps to the next day across a month end", () => {
    expect(nextUkDay("2026-10-31")).toBe("2026-11-01");
    expect(nextUkDay("2026-12-31")).toBe("2027-01-01");
  });
});

describe("face-to-face session rules", () => {
  it("names induction and refresher sessions, and course sessions by their course", () => {
    expect(sessionTitle("induction", null)).toBe("Induction training");
    expect(sessionTitle("refresher", null)).toBe("Annual refresher training");
    expect(sessionTitle("course", "Moving and handling")).toBe("Moving and handling");
  });

  it("lets a booking be cancelled up to 48 hours before, and not after", () => {
    const starts = "2026-11-05T09:30:00Z";
    expect(canCancelBooking(starts, new Date("2026-11-03T09:30:00Z"))).toBe(true);
    expect(canCancelBooking(starts, new Date("2026-11-03T09:31:00Z"))).toBe(false);
  });
});

describe("face-to-face booking emails", () => {
  const session = {
    title: "Moving & Handling",
    startsAt: "2026-11-05T09:30:00Z",
    endsAt: "2026-11-05T12:30:00Z",
    location: "Unit A1, The Embankment, Vale Road, Stockport, SK4 3GN",
    trainer: "Sam <Trainer>",
    notes: null,
  };
  const ctx = { name: "Ann", orgName: "Demo Care", bookedByName: "Mo" };

  it("confirms the booking with where, when and the 48-hour rule", () => {
    const { subject, html } = bookingEmail("booked", session, ctx);
    expect(subject).toBe("Booked: Moving & Handling, Thursday 5 November 2026, 09:30 to 12:30");
    expect(html).toContain("SK4 3GN");
    expect(html).toContain("48 hours before");
    expect(html).toContain("Mo at Demo Care");
  });

  it("escapes what people typed", () => {
    expect(bookingEmail("booked", session, ctx).html).toContain("Sam &lt;Trainer&gt;");
  });

  it("says tomorrow in the reminder's subject", () => {
    expect(bookingEmail("reminder", session, ctx).subject).toBe("Tomorrow: Moving & Handling at 09:30, Stockport");
  });

  it("tells people when we cancel, and when the company does", () => {
    expect(bookingEmail("session_cancelled", session, ctx).html).toContain("please don't go");
    expect(bookingEmail("cancelled", session, ctx).html).toContain("Demo Care has cancelled your place");
  });
});
