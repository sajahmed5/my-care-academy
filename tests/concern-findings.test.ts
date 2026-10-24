import { describe, it, expect } from "vitest";
import {
  cleanConcernFindings,
  concernFindingLines,
  findingsOutstanding,
  findingsStageOf,
  readConcernFindings,
  recordFindings,
  sentOutcomeLetter,
} from "../lib/complaints/findings";

// Ported from myroster tests/unit/concernFindings.test.ts.
describe("a finding on each concern", () => {
  it("reads what was saved and ignores anything malformed", () => {
    const list = readConcernFindings({ concern_findings: [
      { id: "a", concern: "Visits shorter than 30 minutes", finding: "upheld", why: "Visit times show 6 to 14 minutes." },
      { concern: "Lunch not left", finding: "made up", why: 7 },
      "junk", null,
    ] });
    expect(list).toEqual([
      { id: "a", concern: "Visits shorter than 30 minutes", finding: "upheld", why: "Visit times show 6 to 14 minutes." },
      { id: "c2", concern: "Lunch not left", finding: undefined, why: "" },
    ]);
    expect(readConcernFindings({})).toEqual([]);
    expect(readConcernFindings(null)).toEqual([]);
  });

  it("drops blank rows when saving", () => {
    expect(cleanConcernFindings([{ id: "a", concern: "  Short visits ", why: " x " }, { id: "b", concern: "  ", why: "y" }]))
      .toEqual([{ id: "a", concern: "Short visits", why: "x" }]);
  });

  it("is outstanding until every concern has a finding and a reason", () => {
    expect(findingsOutstanding([])).toEqual(["No concerns are listed yet"]);
    expect(findingsOutstanding([
      { id: "a", concern: "Short visits", finding: "upheld", why: "Times show it." },
      { id: "b", concern: "Lunch", why: "" },
      { id: "c", concern: "Early visit", finding: "not_upheld", why: " " },
    ])).toEqual(["Concern 2 has no finding", "Concern 3 has no reason"]);
    expect(findingsOutstanding([{ id: "a", concern: "Short visits", finding: "undetermined", why: "No times held." }])).toEqual([]);
  });

  it("writes one line per concern for a document", () => {
    expect(concernFindingLines([{ id: "a", concern: "Lunch not left on Friday", finding: "partly_upheld", why: "It was not left; it was not on the task list." }]))
      .toEqual(["Lunch not left on Friday — Partly upheld: It was not left; it was not on the task list."]);
  });
});

describe("where a record keeps its findings", () => {
  const findings = { id: "f", name: "Meeting Minutes 2", kind: "meeting_minutes" };
  const followUp = { id: "u", name: "Follow-up", kind: "meeting_minutes" };
  const plan = { id: "p", name: "Action Plan", kind: "action_plan" };
  const triage = { id: "t", name: "Triage", kind: "meeting_minutes" };
  it("is the Findings stage when the record has one", () => {
    expect(findingsStageOf([triage, findings, plan, followUp])?.id).toBe("f");
  });
  it("is the action plan on an issue, which has no Findings stage", () => {
    expect(findingsStageOf([triage, plan, followUp])?.id).toBe("p");
    expect(findingsStageOf([triage, followUp])).toBeUndefined();
  });
  it("reads the list from whichever of the two holds one", () => {
    const list = [{ id: "1", concern: "Late", finding: "upheld", why: "Clock-in" }];
    expect(recordFindings([triage, findings, plan], (id) => (id === "p" ? { concern_findings: list } : null))).toHaveLength(1);
    expect(recordFindings([triage, findings, plan], () => null)).toEqual([]);
  });
});

describe("a sent outcome letter ends a safeguarding concern or an issue", () => {
  const stages = [{ id: "o", name: "Outcome Letter", kind: "outcome_letter", enabled: true }];
  const rec = (a: Record<string, unknown>) => ({ stageEntries: [{ stageId: "o", status: "done", formAnswers: a }] });
  it("only once it has been sent", () => {
    expect(sentOutcomeLetter(rec({ subject: "S", body: "Dear…" }), stages)).toBeNull();
    expect(sentOutcomeLetter(rec({ subject: "S", body: "Dear…", sentOn: "2026-10-04" }), stages)?.sentOn).toBe("2026-10-04");
  });
});
