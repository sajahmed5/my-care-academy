import { describe, expect, it } from "vitest";
import {
  daysLeftLabel,
  endOfUkDay,
  extendedTrialEnd,
  trialEndFrom,
  trialState,
  ukDateKey,
} from "../lib/trial";

/**
 * Free trials (TRIAL.md): seven days, ending at the end of the seventh day in
 * UK time, whatever time of year. The Care Bureau's starts Monday 2 November
 * 2026 (GMT) and ends at the end of Monday 9th.
 */
describe("trial dates", () => {
  it("ends at the end of the day a week after it starts, in GMT", () => {
    expect(trialEndFrom("2026-11-02").toISOString()).toBe("2026-11-09T23:59:59.999Z");
  });

  it("ends at 23:59 British summer time, an hour earlier in UTC", () => {
    expect(endOfUkDay("2026-07-10").toISOString()).toBe("2026-07-10T22:59:59.999Z");
  });

  it("reads the UK date, not the UTC one, late on a summer evening", () => {
    expect(ukDateKey(new Date("2026-07-10T23:30:00Z"))).toBe("2026-07-11");
  });

  it("extends by a week from the current end", () => {
    expect(extendedTrialEnd(new Date("2026-11-09T23:59:59.999Z")).toISOString()).toBe(
      "2026-11-16T23:59:59.999Z",
    );
  });

  it("crosses the clocks going back without losing the end of the day", () => {
    // 22 Oct BST → 29 Oct GMT (clocks go back 25 Oct 2026).
    expect(trialEndFrom("2026-10-22").toISOString()).toBe("2026-10-29T23:59:59.999Z");
  });
});

describe("trial state", () => {
  const ends = "2026-11-09T23:59:59.999Z";

  it("is none without a date", () => {
    expect(trialState(null).kind).toBe("none");
  });

  it("counts UK calendar days left", () => {
    const s = trialState(ends, new Date("2026-11-05T09:00:00Z"));
    expect(s).toMatchObject({ kind: "active", daysLeft: 4 });
  });

  it("is the last day on the end date, until midnight", () => {
    const s = trialState(ends, new Date("2026-11-09T23:59:00Z"));
    expect(s).toMatchObject({ kind: "active", daysLeft: 0 });
    expect(daysLeftLabel(0)).toBe("Last day");
  });

  it("has ended a moment after, with records kept for 30 days", () => {
    const s = trialState(ends, new Date("2026-11-10T00:00:00Z"));
    expect(s.kind).toBe("ended");
    if (s.kind === "ended") expect(ukDateKey(s.removeAt)).toBe("2026-12-09");
  });

  it("labels the days left", () => {
    expect(daysLeftLabel(1)).toBe("1 day left");
    expect(daysLeftLabel(4)).toBe("4 days left");
  });
});
