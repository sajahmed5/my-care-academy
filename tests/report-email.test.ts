import { describe, it, expect } from "vitest";
import {
  reportChanged,
  reportReceivedEmail,
  reportUpdateEmail,
  type ReportChange,
} from "../lib/report-email";

const base: ReportChange = {
  reportNo: 40,
  summary: "Change order",
  prevStatus: "open",
  status: "open",
  prevNote: null,
  note: null,
};

describe("report update email (issue #41)", () => {
  it("only counts a real change — resaving the same thing sends nothing", () => {
    expect(reportChanged(base)).toBe(false);
    expect(reportChanged({ ...base, prevNote: "Hi ", note: "Hi" })).toBe(false);
    expect(reportChanged({ ...base, status: "resolved" })).toBe(true);
    expect(reportChanged({ ...base, note: "Looking into it" })).toBe(true);
  });

  it("names the new status in the subject when it changed", () => {
    const { subject, html } = reportUpdateEmail(
      "Norwood",
      { ...base, status: "resolved", note: "Fixed in v2.5.8" },
      "https://x",
    );
    expect(subject).toBe('Your report #40 "Change order" is now resolved');
    expect(html).toContain("Fixed in v2.5.8");
    expect(html).toContain("(was Open)");
    expect(html).toContain("https://x/report");
  });

  it("says 'update' when only the note changed", () => {
    const { subject } = reportUpdateEmail(null, { ...base, note: "On it" }, "https://x");
    expect(subject).toBe('Update on your report #40 "Change order"');
  });

  it("escapes the summary and note — both are typed by people", () => {
    const { html } = reportUpdateEmail(
      "<b>",
      { ...base, summary: "<script>", note: "a & b" },
      "https://x",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("a &amp; b");
  });
});

describe("report received email (issue #47)", () => {
  it("names the report and its number in the subject", () => {
    const { subject } = reportReceivedEmail(
      "Norwood",
      { reportNo: 47, summary: "Filter not working" },
      "https://x",
    );
    expect(subject).toBe("We've logged your report #47: Filter not working");
  });

  it("quotes back what they wrote, and links to their reports", () => {
    const { html } = reportReceivedEmail(
      "Norwood",
      { reportNo: 47, summary: "Filter not working", description: "The dropdown does nothing." },
      "https://x",
    );
    expect(html).toContain("Hi Norwood");
    expect(html).toContain("The dropdown does nothing.");
    expect(html).toContain("https://x/report");
  });

  it("leaves out the detail block when they only gave a summary", () => {
    const { html } = reportReceivedEmail(null, { reportNo: 48, summary: "Slow" }, "https://x");
    expect(html).toContain("Hi there");
    expect(html).not.toContain("What you told us");
  });

  it("escapes what they typed", () => {
    const { html } = reportReceivedEmail(
      "<b>",
      { reportNo: 49, summary: "<script>", description: "a & b" },
      "https://x",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("a &amp; b");
  });
});
