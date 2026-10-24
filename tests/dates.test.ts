import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../lib/dates";

/**
 * The bug these guard against: Vercel's functions run in UTC and the carer's
 * browser runs in London, so anything formatted without a named timezone came
 * out a day apart on the two sides of a render. In a client component React
 * threw the tree away over it (hydration error #418) — it was doing that on
 * /org/billing, where a console user had last been seen at 23:30 UTC.
 *
 * These dates are the ones that only agree if the timezone is pinned: late
 * evening UTC in British summer time is already the next morning in London.
 */
describe("dates are formatted in UK time", () => {
  it("gives the London day for a timestamp still in yesterday in UTC", () => {
    expect(
      formatDate("2026-10-23T23:30:09.448Z", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    ).toBe("24 Oct 2026");
  });

  it("formats the same way whatever options come with it", () => {
    expect(formatDate("2026-10-23T23:30:09.448Z")).toBe("24/10/2026");
    expect(
      formatDateTime("2026-10-23T23:30:09.448Z", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    ).toBe("24/10/2026, 00:30");
  });

  // Winter: London is UTC, so the two agree and nothing shifts.
  it("leaves a GMT timestamp where it is", () => {
    expect(
      formatDate("2026-01-15T23:30:00.000Z", { day: "numeric", month: "short" }),
    ).toBe("15 Jan");
  });
});
