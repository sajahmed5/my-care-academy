import { describe, expect, it } from "vitest";
import { AUDIT_KINDS, auditFindings, auditScore, unanswered, type AuditAnswer } from "../lib/audits";

const med = AUDIT_KINDS.find((k) => k.key === "medication")!;

describe("audits", () => {
  it("scores only the questions that apply", () => {
    expect(auditScore({ a: "yes", b: "yes", c: "no", d: "na" })).toBe(67);
    expect(auditScore({ a: "na" })).toBeNull();
  });
  it("turns every 'no' into a finding", () => {
    const answers: Record<string, AuditAnswer> = Object.fromEntries(med.questions.map((q) => [q.id, "yes" as AuditAnswer]));
    answers.fridge = "no";
    answers.cd = "na";
    expect(auditFindings(med, answers).map((f) => f.id)).toEqual(["fridge"]);
  });
  it("lists what is still unanswered", () => {
    expect(unanswered(med, {})).toHaveLength(med.questions.length);
  });
  it("has unique question ids in every template", () => {
    for (const k of AUDIT_KINDS) expect(new Set(k.questions.map((q) => q.id)).size).toBe(k.questions.length);
  });
});
