import { describe, it, expect } from "vitest";
import { buildSteps, nextStep, stepOfStage } from "../lib/complaints/steps";

// Ported from myroster tests/unit/complaintSteps.test.ts. The stage list is
// the reference's, kinds and all: a stage kind this project does not offer
// must still land in the right step.
const complaint = [
  { id: "form", name: "Complaint Form", kind: "complaint_form" },
  { id: "tri", name: "Triage", kind: "meeting_minutes" },
  { id: "ack", name: "Acknowledgement", kind: "acknowledgement" },
  { id: "st", name: "Carer Statement", kind: "carer_statement" },
  { id: "qa", name: "Previous QAs", kind: "evidence_qa" },
  { id: "ecm", name: "ECM Data", kind: "document" },
  { id: "other", name: "Other", kind: "document" },
  { id: "find", name: "Meeting Minutes 2", kind: "meeting_minutes" },
  { id: "doc", name: "Duty of Candour Letter", kind: "duty_of_candour" },
  { id: "rev", name: "Client Complaint Review", kind: "client_complaint_review" },
  { id: "fu", name: "Follow-up", kind: "meeting_minutes" },
];
const e = (stageId: string, status: string, formAnswers?: Record<string, unknown>) => ({ stageId, status, formAnswers });
const rec = { reportedOn: "2026-09-29", completeBy: "2026-10-27", closed: false };

describe("the steps of a complaint", () => {
  it("puts each stage in the step where the work happens", () => {
    expect(complaint.map(stepOfStage)).toEqual(["raised", "triage", "acknowledge", "investigate", "investigate", "investigate", "investigate", "findings", "outcome", "outcome", "close"]);
  });

  it("numbers seven steps for a complaint", () => {
    expect(buildSteps(complaint, [], false).map((s) => `${s.n} ${s.title}`)).toEqual([
      "1 Concern raised", "2 Triage", "3 Acknowledge", "4 Investigate", "5 Findings", "6 Outcome", "7 Follow-up and close",
    ]);
  });

  it("leaves out a step an issue does not have, without a gap in the numbers", () => {
    const issue = complaint.filter((s) => !["doc", "rev", "qa", "ecm", "find", "fu"].includes(s.id));
    expect(buildSteps(issue, [], false).map((s) => `${s.n} ${s.title}`)).toEqual([
      "1 Concern raised", "2 Triage", "3 Acknowledge", "4 Investigate", "5 Follow-up and close",
    ]);
  });

  it("the current step is the first unfinished one; a later one already begun is started", () => {
    const steps = buildSteps(complaint, [e("form", "done"), e("tri", "done"), e("st", "done")], false);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "started", "todo", "todo", "todo"]);
  });

  it("not needed counts as finished, and Other never holds a step up", () => {
    const steps = buildSteps(complaint, [e("st", "done"), e("qa", "na"), e("ecm", "done")], false);
    const inv = steps.find((s) => s.key === "investigate")!;
    expect([inv.doneCount, inv.total]).toEqual([3, 3]);
  });

  it("the last step is not done until the record is closed", () => {
    const all = complaint.map((s) => e(s.id, "done"));
    expect(buildSteps(complaint, all, false).at(-1)?.state).toBe("current");
    expect(buildSteps(complaint, all, true).at(-1)?.state).toBe("done");
  });
});

describe("the next thing to do", () => {
  const upTo = (...ids: string[]) => ids.map((id) => e(id, "done"));

  it("asks for triage first", () => {
    const entries = upTo("form");
    expect(nextStep(buildSteps(complaint, entries, false), entries, rec, "2026-09-29").text).toMatch(/^Triage this concern/);
  });

  it("says when the acknowledgement is due, and when it is late", () => {
    const entries = upTo("form", "tri");
    const steps = buildSteps(complaint, entries, false);
    expect(nextStep(steps, entries, rec, "2026-10-01")).toEqual({ step: "acknowledge", text: "Send the acknowledgement by Fri 2 Oct." });
    expect(nextStep(steps, entries, rec, "2026-10-04")).toEqual({ step: "acknowledge", late: true, text: "Send the acknowledgement. It was due Fri 2 Oct." });
  });

  it("counts what is in while investigating and names what is not", () => {
    const entries = [...upTo("form", "tri", "ack", "st"), e("qa", "na")];
    expect(nextStep(buildSteps(complaint, entries, false), entries, rec, "2026-10-04").text).toBe("Investigate: 2 of 3 in. Still to come: ECM Data.");
  });

  it("flags a response past its date", () => {
    const entries = upTo("form", "tri", "ack", "st", "qa", "ecm", "find");
    const n = nextStep(buildSteps(complaint, entries, false), entries, rec, "2026-10-30");
    expect(n.late).toBe(true);
    expect(n.text).toContain("was due Tue 27 Oct");
  });

  it("ends by asking for the record to be closed", () => {
    const entries = complaint.map((s) => e(s.id, "done"));
    expect(nextStep(buildSteps(complaint, entries, false), entries, rec, "2026-10-20").text).toBe("Everything is in. Close the record.");
    expect(nextStep(buildSteps(complaint, entries, true), entries, { ...rec, closed: true }, "2026-10-20").text).toBe("This record is closed.");
  });
});

describe("the Next line during Triage", () => {
  it("names what is missing once Triage has been started", () => {
    const entries = [e("form", "done"), e("tri", "pending", { tri_type: "complaint", mm1_date: "2026-09-30", mm1_attendees: [] })];
    expect(nextStep(buildSteps(complaint, entries, false), entries, rec, "2026-09-30").text).toBe("Triage this concern: say when it was held and who took part.");
  });
  it("points at the checks when the answers are in", () => {
    const entries = [e("form", "done"), e("tri", "pending", { tri_type: "complaint", mm1_date: "2026-09-30", mm1_attendees: ["Saj"] })];
    expect(nextStep(buildSteps(complaint, entries, false), entries, rec, "2026-09-30").text).toMatch(/give each check an owner and a date/);
  });
});
