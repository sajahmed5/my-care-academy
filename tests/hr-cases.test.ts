import { describe, expect, it } from "vitest";
import { activeWarning, caseRef, caseSettingsFromRow, deadlines, enoughNotice, legalReminders, warningExpiry, type HrCase } from "../lib/hr/cases";
import { LETTER_TEMPLATES, draftLetter, sanitiseOverrides, templateInForce } from "../lib/hr/letters";

const s = caseSettingsFromRow(null);
const base = (over: Partial<HrCase>): HrCase => ({
  id: "c",
  kind: "disciplinary",
  subtype: "conduct",
  stage: "concern",
  user_id: "u",
  raised_on: "2026-10-01",
  suspended_on: null,
  suspension_review_on: null,
  suspension_ended_on: null,
  hearing_on: null,
  invited_on: null,
  outcome: null,
  outcome_on: null,
  warning_expires_on: null,
  appeal_received_on: null,
  appeal_hearing_on: null,
  appeal_outcome: null,
  closed_on: null,
  dbs_referral: "unknown",
  cqc_notice: "unknown",
  la_notice: "unknown",
  ...over,
});

describe("case references", () => {
  it("are numbered per kind and year", () => {
    expect(caseRef("disciplinary", 2026, 4)).toBe("DIS-2026-004");
    expect(caseRef("grievance", 2027, 12)).toBe("GRV-2027-012");
  });
});

describe("warnings", () => {
  it("last 6 months for a first written and 12 for a final, unless set", () => {
    expect(warningExpiry("first_written", "2026-10-30", s)).toBe("2027-04-30");
    expect(warningExpiry("final_written", "2026-10-30", s)).toBe("2027-10-30");
    expect(warningExpiry("first_written", "2026-10-30", s, 3)).toBe("2027-01-30");
    expect(warningExpiry("dismissal", "2026-10-30", s)).toBeNull();
  });
  it("show as active until they expire or an appeal overturns them", () => {
    const w = base({ outcome: "final_written", warning_expires_on: "2027-01-01" });
    expect(activeWarning(w, "2026-12-31")).toBe(true);
    expect(activeWarning(w, "2027-01-02")).toBe(false);
    expect(activeWarning({ ...w, appeal_outcome: "upheld" }, "2026-12-31")).toBe(false);
  });
});

describe("deadlines", () => {
  it("chase the suspension review, the invite's notice, the hearing and the appeal window", () => {
    expect(deadlines(base({ suspended_on: "2026-10-01", suspension_review_on: "2026-10-15" }), s)).toEqual([{ on: "2026-10-15", what: "Review the suspension" }]);
    expect(deadlines(base({ hearing_on: "2026-11-10" }), s).map((d) => d.on)).toEqual(["2026-11-05", "2026-11-10"]);
    expect(deadlines(base({ hearing_on: "2026-11-10", invited_on: "2026-11-01", outcome: "first_written", outcome_on: "2026-11-10" }), s)).toEqual([
      { on: "2026-11-15", what: "The appeal window closes" },
    ]);
    expect(deadlines(base({ outcome: "no_action", outcome_on: "2026-11-10" }), s)).toEqual([]);
    expect(deadlines(base({ closed_on: "2026-11-11", suspended_on: "2026-10-01", suspension_review_on: "2026-10-15" }), s)).toEqual([]);
  });
  it("ask for a grievance to be acknowledged", () => {
    expect(deadlines(base({ kind: "grievance", stage: "raised" }), s)).toEqual([{ on: "2026-10-06", what: "Acknowledge the grievance" }]);
  });
  it("hold notice to the company's minimum", () => {
    expect(enoughNotice("2026-11-04", "2026-10-30", 5)).toBe(true);
    expect(enoughNotice("2026-11-03", "2026-10-30", 5)).toBe(false);
  });
});

describe("legal reminders", () => {
  it("ask about a DBS barring referral on a dismissal, and chase what's needed", () => {
    expect(legalReminders(base({ outcome: "dismissal" }))).toEqual(["Decide whether a DBS barring referral is needed"]);
    expect(legalReminders(base({ outcome: "dismissal", dbs_referral: "done", cqc_notice: "needed" }))).toEqual(["Tell CQC"]);
  });
});

describe("ACAS letters", () => {
  it("always keep the right to be accompanied and to appeal, whatever the company writes", () => {
    for (const kind of ["case_hearing_invite", "grievance_meeting_invite", "case_appeal_invite"]) {
      const t = templateInForce(kind, sanitiseOverrides({ [kind]: { body: "Short." } }))!;
      expect(draftLetter(t, {}).fixed.join(" ")).toContain("right to be accompanied");
    }
    for (const kind of ["case_outcome_warning", "case_outcome_dismissal", "grievance_outcome", "probation_not_passed"]) {
      expect(draftLetter(templateInForce(kind, {})!, { deadline: "6 November 2026" }).fixed.join(" ")).toContain("right to appeal against this decision");
    }
  });
  it("are all known kinds with a subject and body", () => {
    for (const t of LETTER_TEMPLATES) expect(t.subject && t.body).toBeTruthy();
  });
});
