import { describe, expect, it } from "vitest";
import { addWorkingDays, bankHolidays, isWorkingDay, reportDueOn, workingDaysLeft } from "../lib/bespoke/working-days";
import { dueWords, readRequest } from "../lib/bespoke/requests";
import { newRequestEmail, requestMessageEmail, requestStatusEmail } from "../lib/bespoke/request-email";

describe("bank holidays in England and Wales", () => {
  // From gov.uk/bank-holidays.
  it("match the published dates", () => {
    expect(bankHolidays(2026)).toEqual([
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-04",
      "2026-05-25",
      "2026-08-31",
      "2026-12-25",
      "2026-12-28",
    ]);
    expect(bankHolidays(2027)).toEqual([
      "2027-01-01",
      "2027-03-26",
      "2027-03-29",
      "2027-05-03",
      "2027-05-31",
      "2027-08-30",
      "2027-12-27",
      "2027-12-28",
    ]);
    expect(bankHolidays(2028)).toEqual([
      "2028-01-03",
      "2028-04-14",
      "2028-04-17",
      "2028-05-01",
      "2028-05-29",
      "2028-08-28",
      "2028-12-25",
      "2028-12-26",
    ]);
  });

  it("are not working days, nor are weekends", () => {
    expect(isWorkingDay("2026-12-25")).toBe(false);
    expect(isWorkingDay("2026-10-31")).toBe(false); // Saturday
    expect(isWorkingDay("2026-10-30")).toBe(true);
  });
});

describe("the 10-working-day promise", () => {
  it("counts from the next working day", () => {
    // Friday 30 Oct 2026: two weeks on is Friday 13 Nov.
    expect(reportDueOn("2026-10-30")).toBe("2026-11-13");
    // Asked on a Saturday: the same as asking the Friday before.
    expect(reportDueOn("2026-10-31")).toBe("2026-11-13");
  });

  it("skips Christmas and Boxing Day", () => {
    // Friday 18 Dec 2026: 21, 22, 23, 24, 29, 30, 31 Dec, 4, 5, 6 Jan.
    expect(reportDueOn("2026-12-18")).toBe("2027-01-06");
  });

  it("says how many working days are left, or how many late", () => {
    expect(workingDaysLeft("2026-10-30", "2026-11-13")).toBe(10);
    expect(workingDaysLeft("2026-11-13", "2026-11-13")).toBe(0);
    expect(workingDaysLeft("2026-11-16", "2026-11-13")).toBe(-1);
    expect(addWorkingDays("2026-11-13", 1)).toBe("2026-11-16");
  });

  it("puts it in words", () => {
    expect(dueWords("2026-10-30", "2026-11-13")).toEqual({ text: "Due in 10 working days", late: false });
    expect(dueWords("2026-11-13", "2026-11-16")).toEqual({ text: "Due the next working day", late: false });
    expect(dueWords("2026-11-13", "2026-11-13").text).toBe("Due today");
    expect(dueWords("2026-11-17", "2026-11-13")).toEqual({ text: "2 working days late", late: true });
  });
});

describe("the request form", () => {
  const good = {
    title: "Monthly summary",
    question: "Who is out of date, by region.",
    audience: "directors",
    frequency: "monthly",
    format: "pdf",
  };

  it("accepts a complete request", () => {
    expect(readRequest(good)).toEqual({
      title: "Monthly summary",
      question: "Who is out of date, by region.",
      audience: "directors",
      audienceOther: null,
      frequency: "monthly",
      format: "pdf",
    });
  });

  it("asks for what's missing", () => {
    expect(readRequest({ ...good, title: " " })).toBe("Give the report a name.");
    expect(readRequest({ ...good, question: "" })).toBe("Tell us what you want the report to show.");
    expect(readRequest({ ...good, audience: "x" })).toBe("Choose who the report is for.");
    expect(readRequest({ ...good, audience: "other" })).toBe("Say who the report is for.");
    expect(readRequest({ ...good, frequency: "" })).toBe("Choose how often you need it.");
    expect(readRequest({ ...good, format: "word" })).toBe("Choose the format you'd like.");
  });

  it("keeps who it's for only when it's someone else", () => {
    const r = readRequest({ ...good, audience: "other", audienceOther: "Our insurer" });
    expect(typeof r !== "string" && r.audienceOther).toBe("Our insurer");
    const s = readRequest({ ...good, audienceOther: "ignored" });
    expect(typeof s !== "string" && s.audienceOther).toBeNull();
  });
});

describe("request emails", () => {
  const r = {
    id: "abc",
    requestNo: 7,
    title: "Training <by> region",
    question: "Who & when",
    audience: "cqc",
    audienceOther: null,
    frequency: "weekly",
    format: "excel",
    dueOn: "2026-11-13",
  };

  it("tell us what was asked, escaped, with a link to the request", () => {
    const m = newRequestEmail(r, "Demo Care", "Sam", "https://x.test");
    expect(m.subject).toBe("Report request #7 from Demo Care: Training <by> region");
    expect(m.html).toContain("Training &lt;by&gt; region");
    expect(m.html).toContain("Who &amp; when");
    expect(m.html).toContain("Every week");
    expect(m.html).toContain("https://x.test/platform/bespoke-reports/requests/abc");
  });

  it("send a message to the right side", () => {
    expect(requestMessageEmail(r, "hi", "company", "My Care Academy", "https://x.test").html).toContain(
      "https://x.test/org/reports/requests/abc",
    );
    expect(requestMessageEmail(r, "hi", "us", "Sam", "https://x.test").html).toContain(
      "https://x.test/platform/bespoke-reports/requests/abc",
    );
  });

  it("say when it's being built and when it's ready", () => {
    expect(requestStatusEmail(r, "building", "Sam", "https://x.test").html).toContain("Friday 13 November");
    const ready = requestStatusEmail(r, "ready", null, "https://x.test", "rep1");
    expect(ready.subject).toBe('Your report "Training <by> region" is ready');
    expect(ready.html).toContain("https://x.test/org/reports/bespoke/rep1");
  });
});
