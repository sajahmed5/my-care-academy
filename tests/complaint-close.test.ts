import { describe, it, expect } from "vitest";
import { closeGaps, closeGapsMessage } from "../lib/complaints/close";

// Ported from myroster tests/unit/complaintClose.test.ts.
const stages = [
  { id: "form", name: "Complaint Form", kind: "complaint_form" },
  { id: "tri", name: "Triage", kind: "meeting_minutes" },
  { id: "qa", name: "Previous QAs", kind: "evidence_qa" },
  { id: "other", name: "Other", kind: "document" },
  { id: "fu", name: "Follow-up", kind: "meeting_minutes" },
];

describe("what stands between a complaint and being closed", () => {
  it("is every stage that is neither done nor marked not needed", () => {
    const gaps = closeGaps(stages, [{ stageId: "form", status: "done" }, { stageId: "qa", status: "na" }]);
    expect(gaps.map((g) => g.name)).toEqual(["Triage", "Follow-up"]);
    expect(gaps.map((g) => g.step)).toEqual(["triage", "close"]);
  });
  it("never counts the Other box", () => {
    expect(closeGaps(stages, stages.filter((s) => s.id !== "other").map((s) => ({ stageId: s.id, status: "done" })))).toEqual([]);
  });
  it("treats a stage nobody has touched as a gap", () => {
    expect(closeGaps(stages, [])).toHaveLength(4);
  });
  it("says what to do in one sentence, and nothing when there is nothing", () => {
    expect(closeGapsMessage(closeGaps(stages, [{ stageId: "form", status: "done" }, { stageId: "tri", status: "done" }, { stageId: "qa", status: "done" }])))
      .toBe("This cannot be closed yet. Still to do, or to mark as not needed: Follow-up.");
    expect(closeGapsMessage([])).toBe("");
    expect(closeGapsMessage([], true)).toContain("has not been triaged");
  });
});

describe("work that must finish first", () => {
  it("holds a record open for a running plan and for actions not done", () => {
    const msg = closeGapsMessage([], false, { openPlans: ["Performance plan for Jane Smith"], openActions: ["Review ECM data — Sam Ilyas"] });
    expect(msg).toContain("Actions not yet done: Review ECM data — Sam Ilyas.");
    expect(msg).toContain("Still running: Performance plan for Jane Smith.");
  });
  it("says nothing when the stages, the actions and the plans are all finished", () => {
    expect(closeGapsMessage([], false, { openPlans: [], openActions: [] })).toBe("");
  });
});
