import { describe, expect, it } from "vitest";
import { CHECKLIST, asksAboutDbs, checklistDone, factualReference, jobMaySwitchOff, leaverConsoleBlock, loginDueOff, sanitiseChecklist } from "../lib/hr/leavers";
import { orgFeatureOn } from "../lib/hr/features-rule";
import { hrLetterHtml } from "../lib/hr/letters";
import { brandEmailHtml } from "../lib/email-layout";

describe("the leaver checklist", () => {
  it("keeps only known items, and counts what's done", () => {
    const c = sanitiseChecklist({ badge: { done: true, on: "2026-11-01" }, key_safes: { done: false, note: " Mrs Smith " }, nonsense: { done: true } });
    expect(c).toEqual({ badge: { done: true, on: "2026-11-01", note: null }, key_safes: { done: false, on: null, note: "Mrs Smith" } });
    expect(checklistDone(c)).toBe(1);
    expect(CHECKLIST.map((i) => i.key)).toContain("key_safes");
  });
});

describe("their login", () => {
  it("goes off the day after their last working day", () => {
    expect(loginDueOff("2026-10-30", "2026-10-30")).toBe(false);
    expect(loginDueOff("2026-10-30", "2026-10-31")).toBe(true);
  });
});

describe("the DBS barring referral reminder", () => {
  it("asks when someone is dismissed or leaves before they would have been", () => {
    expect(asksAboutDbs("dismissed")).toBe(true);
    expect(asksAboutDbs("resigned")).toBe(true);
    expect(asksAboutDbs("retired")).toBe(false);
  });
});

describe("a factual reference", () => {
  it("gives the dates, the role and the reason, and nothing else", () => {
    const r = factualReference({
      fullName: "Ann Carer",
      companyName: "Demo Care Ltd",
      jobTitle: "Care assistant",
      startDate: "1 April 2026",
      lastDay: "30 November 2026",
      reason: "resigned",
      requesterName: "Bob",
    });
    expect(r).toContain("employed by Demo Care Ltd as Care assistant from 1 April 2026 until 30 November 2026");
    expect(r).toContain("Their reason for leaving: resigned.");
  });
});

describe("a manager's or office worker's leaving", () => {
  it("is for a manager to record or switch off; a carer's is for anyone in the office", () => {
    expect(leaverConsoleBlock("org_office", "learner")).toBeNull();
    expect(leaverConsoleBlock("org_admin", "learner")).toBeNull();
    expect(leaverConsoleBlock("org_office", "org_admin")).toMatch(/Only a manager/);
    expect(leaverConsoleBlock("org_office", "org_office")).toMatch(/Only a manager/);
    expect(leaverConsoleBlock("org_admin", "org_admin")).toBeNull();
    expect(leaverConsoleBlock("org_admin", "org_office")).toBeNull();
  });

  it("is switched off by the daily job only if a manager in the company made the record", () => {
    const org = "org-1";
    expect(jobMaySwitchOff("learner", null, org)).toBe(true);
    expect(jobMaySwitchOff("learner", { role: "org_office", organisation_id: org }, org)).toBe(true);
    expect(jobMaySwitchOff("org_office", { role: "org_admin", organisation_id: org }, org)).toBe(true);
    expect(jobMaySwitchOff("org_admin", { role: "org_admin", organisation_id: org }, org)).toBe(true);
    // Made by an office worker, by someone since gone, or from another company: a manager does it by hand.
    expect(jobMaySwitchOff("org_admin", { role: "org_office", organisation_id: org }, org)).toBe(false);
    expect(jobMaySwitchOff("org_office", null, org)).toBe(false);
    expect(jobMaySwitchOff("org_office", { role: "org_admin", organisation_id: "org-2" }, org)).toBe(false);
  });
});

describe("a feature for many companies at once", () => {
  const tiers = [
    { tier_key: "core_recruitment", feature_key: "recruitment.tracker" },
    { tier_key: "growth", feature_key: "documents.compliance_pack" },
  ];
  it("follows the company's override, else its package, as org_has_feature does", () => {
    expect(orgFeatureOn("recruitment.tracker", "core_recruitment", [], tiers)).toBe(true);
    expect(orgFeatureOn("recruitment.tracker", "starter", [], tiers)).toBe(false);
    expect(orgFeatureOn("recruitment.tracker", null, [], tiers)).toBe(false);
    expect(orgFeatureOn("recruitment.tracker", "starter", [{ feature_key: "recruitment.tracker", enabled: true }], tiers)).toBe(true);
    expect(orgFeatureOn("recruitment.tracker", "core_recruitment", [{ feature_key: "recruitment.tracker", enabled: false }], tiers)).toBe(false);
    expect(orgFeatureOn("recruitment.tracker", "core_recruitment", [{ feature_key: "recruitment.tracker", enabled: null }], tiers)).toBe(true);
  });
  it("counts the compliance pack as the library", () => {
    expect(orgFeatureOn("documents.library", "growth", [], tiers)).toBe(true);
    expect(orgFeatureOn("documents.library", "starter", [{ feature_key: "documents.compliance_pack", enabled: true }], tiers)).toBe(true);
  });
});

describe("an HR letter by email", () => {
  const html = hrLetterHtml({
    company: "Demo Care Ltd",
    date: "30 October 2026",
    greeting: "Dear Ann,",
    body: "First paragraph.\n\nSecond <b>paragraph</b>.",
    fixed: ["You may appeal."],
    signer: { name: "Pat Manager", title: "Manager" },
  });
  it("keeps the letter's wording, escaped", () => {
    expect(html).toContain("Demo Care Ltd");
    expect(html).toContain("Dear Ann,");
    expect(html).toContain("Second &lt;b&gt;paragraph&lt;/b&gt;.");
    expect(html).toContain("You may appeal.");
    expect(html).toContain("Yours sincerely,");
    expect(html).toContain("A copy is kept on your file, and you can read it when you sign in.");
  });
  it("is in the email frame, so white label puts the company's logo on it", () => {
    const branded = brandEmailHtml(html, { name: "Demo Care Ltd", logoUrl: "https://example.test/logo.png", colour: null });
    expect(branded).toContain('src="https://example.test/logo.png"');
    expect(branded).toContain("Powered by My Care Academy");
  });
});
