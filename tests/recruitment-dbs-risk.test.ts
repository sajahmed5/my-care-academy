import { describe, expect, it } from "vitest";
import { decisionKey, validateDbsRisk } from "../lib/recruitment-dbs-risk";

const today = "2026-10-30";
const full = {
  certificateNumber: "001234567890",
  certificateDate: "2026-10-10",
  offences: "Theft, 2015, fine",
  declared: "yes",
  discussedOn: "2026-10-29",
  theirAccount: "A one-off.",
  relevant: "no",
  relevantWhy: "Not about vulnerable people.",
  pattern: "no",
  barred: "no",
  decision: "Employ",
  reasons: "Minor and long ago.",
  assessorName: "A Manager",
  assessorRole: "Registered manager",
};

describe("the DBS risk assessment", () => {
  it("finishes when every required answer is given", () => {
    expect(validateDbsRisk(full, today)).toEqual({});
    expect(decisionKey(full)).toBe("employ");
  });
  it("asks what the safeguards are when employing with safeguards, and allows a review date ahead", () => {
    const problems = validateDbsRisk({ ...full, decision: "Employ with safeguards", reviewOn: "2027-01-31" }, today);
    expect(problems.drSafeguards?.map((e) => e.field)).toEqual(["safeguards"]);
  });
  it("never lets someone on the barred list be employed", () => {
    expect(validateDbsRisk({ ...full, barred: "yes" }, today).drDecision?.map((e) => e.field)).toEqual(["decision"]);
    expect(validateDbsRisk({ ...full, barred: "yes", decision: "Don't employ" }, today)).toEqual({});
  });
});
