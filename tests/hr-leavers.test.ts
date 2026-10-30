import { describe, expect, it } from "vitest";
import { CHECKLIST, asksAboutDbs, checklistDone, factualReference, loginDueOff, sanitiseChecklist } from "../lib/hr/leavers";

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
