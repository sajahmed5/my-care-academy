import { describe, expect, it } from "vitest";
import { nextSendOn, readRecipients, readSchedule, scheduleLabel, storedRecipients, ukHour } from "../lib/bespoke/schedule";
import { scheduledReportEmail } from "../lib/bespoke/schedule-email";

describe("when a scheduled report goes next", () => {
  // Friday 30 Oct 2026.
  it("finds the next weekday, never today", () => {
    expect(nextSendOn({ frequency: "weekly", weekday: 1, dayOfMonth: null }, "2026-10-30")).toBe("2026-11-02");
    expect(nextSendOn({ frequency: "weekly", weekday: 5, dayOfMonth: null }, "2026-10-30")).toBe("2026-11-06");
    expect(nextSendOn({ frequency: "weekly", weekday: 7, dayOfMonth: null }, "2026-10-30")).toBe("2026-11-01");
  });

  it("finds the day this month or next, across the year end", () => {
    expect(nextSendOn({ frequency: "monthly", weekday: null, dayOfMonth: 1 }, "2026-10-30")).toBe("2026-11-01");
    expect(nextSendOn({ frequency: "monthly", weekday: null, dayOfMonth: 28 }, "2026-10-27")).toBe("2026-10-28");
    expect(nextSendOn({ frequency: "monthly", weekday: null, dayOfMonth: 28 }, "2026-10-28")).toBe("2026-11-28");
    expect(nextSendOn({ frequency: "monthly", weekday: null, dayOfMonth: 15 }, "2026-12-20")).toBe("2027-01-15");
  });

  it("says it in words", () => {
    expect(scheduleLabel({ frequency: "weekly", weekday: 1, dayOfMonth: null, format: "pdf" })).toBe("Every Monday, as a PDF");
    expect(scheduleLabel({ frequency: "monthly", weekday: null, dayOfMonth: 1, format: "xlsx" })).toBe("On the 1st of every month, as Excel");
    expect(scheduleLabel({ frequency: "monthly", weekday: null, dayOfMonth: 22, format: "pdf" })).toContain("22nd");
    expect(scheduleLabel({ frequency: "monthly", weekday: null, dayOfMonth: 13, format: "pdf" })).toContain("13th");
  });

  it("reads the UK hour, summer and winter", () => {
    expect(ukHour(new Date("2026-07-01T06:30:00Z"))).toBe(7);
    expect(ukHour(new Date("2026-12-01T06:30:00Z"))).toBe(6);
  });
});

describe("the schedule form", () => {
  const base = { frequency: "monthly", weekday: "", dayOfMonth: "1", format: "pdf", names: ["Sam Director"], emails: ["Sam@Example.com"] };

  it("accepts a schedule, emails in lower case", () => {
    expect(readSchedule(base)).toEqual({
      frequency: "monthly",
      weekday: null,
      dayOfMonth: 1,
      format: "pdf",
      recipients: [{ name: "Sam Director", email: "sam@example.com" }],
    });
  });

  it("checks the day for its frequency", () => {
    expect(readSchedule({ ...base, dayOfMonth: "31" })).toBe("Choose a day of the month from 1 to 28.");
    expect(readSchedule({ ...base, frequency: "weekly", weekday: "0" })).toBe("Choose the day of the week.");
    expect(readSchedule({ ...base, frequency: "daily" })).toBe("Choose how often it's sent.");
    expect(readSchedule({ ...base, format: "csv" })).toBe("Choose PDF or Excel.");
  });

  it("needs real, distinct email addresses, at most 20", () => {
    expect(readRecipients(["", ""], ["", ""])).toBe("Add at least one person to send it to.");
    expect(readRecipients(["Sam"], [""])).toBe("Give an email address for Sam.");
    expect(readRecipients(["Sam"], ["sam@"])).toBe("sam@ doesn't look like an email address.");
    expect(readRecipients(["A", "B"], ["a@x.com", "A@x.com"])).toEqual([{ name: "A", email: "a@x.com" }]);
    expect(readRecipients([""], ["a@x.com"])).toEqual([{ name: "a@x.com", email: "a@x.com" }]);
    const many = Array.from({ length: 21 }, (_, i) => `p${i}@x.com`);
    expect(readRecipients(many, many)).toBe("Send it to 20 people at most.");
  });

  it("reads stored recipients defensively", () => {
    expect(storedRecipients([{ name: "A", email: "a@x.com" }, { nope: 1 }, null])).toEqual([{ name: "A", email: "a@x.com" }]);
    expect(storedRecipients("x")).toEqual([]);
  });
});

describe("the scheduled email", () => {
  it("names the report, the company and the person, escaped, with a live link", () => {
    const m = scheduledReportEmail(
      { id: "r1", title: "Training <monthly>" },
      "Demo & Co",
      { name: "Sam", email: "sam@x.com" },
      "Sent every Monday, as a PDF",
      "pdf",
      new Date("2026-11-02T08:00:00Z"),
    );
    expect(m.subject).toBe("Training <monthly>: 2 Nov 2026");
    expect(m.html).toContain("Training &lt;monthly&gt;");
    expect(m.html).toContain("Demo &amp; Co");
    expect(m.html).toContain("Hi Sam,");
    expect(m.html).toContain("/org/reports/bespoke/r1");
    expect(m.html).toContain("attached as a PDF");
  });
});
