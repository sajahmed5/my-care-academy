import { describe, it, expect } from "vitest";
import { formStageStatus, requiredMissing, triageChecksUnassigned, TRIAGE_CHECKS } from "../lib/complaints/stage-status";
import { triageSchema, followUpSchema } from "../lib/complaints/forms";

// Ported from myroster tests/unit/complaintStageStatus.test.ts.
const triage = { mm1_date: "2026-09-28", mm1_attendees: ["Sam Ilyas"], mm1_issue: "Short visits.", tri_type: "complaint" };

describe("when a form stage is done", () => {
  it("is not done on one answer", () => {
    expect(formStageStatus(triageSchema, { mm1_date: "2026-09-28" })).toBe("pending");
  });
  it("treats an empty people list as unanswered", () => {
    expect(requiredMissing(triageSchema, { ...triage, mm1_attendees: [] })).toHaveLength(1);
  });
  it("triage is not done while a standing check has no owner", () => {
    expect(formStageStatus(triageSchema, triage, ["Obtain carer statement", "Review ECM data"])).toBe("pending");
    expect(triageChecksUnassigned(["obtain carer statement ", "Review ECM data"])).toEqual(["Review previous QAs", "Review spot-checks", "Review training records"]);
    expect(formStageStatus(triageSchema, triage, [...TRIAGE_CHECKS])).toBe("done");
  });
  it("counts No as an answer, and ignores required questions that are hidden", () => {
    const followUp = { mm3_date: "2026-10-20", mm3_attendees: ["Sam Ilyas"], mm3_actions_complete: false, mm3_prevention: "x", mm3_satisfied: true, mm3_summary: "x" };
    expect(formStageStatus(followUpSchema, followUp)).toBe("done");
  });
});
