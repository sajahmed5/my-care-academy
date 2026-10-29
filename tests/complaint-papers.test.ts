import { describe, expect, it } from "vitest";
import { concernTrends, lastMonths } from "../lib/complaints/trends";
import { completedItems, outstandingItems } from "../lib/complaints/interim";
import { findReadinessGaps } from "../lib/complaints/readiness";
import { complaintGuidance } from "../lib/complaints/guidance";

const stages = [
  { id: "form", name: "Complaint Form", kind: "complaint_form" },
  { id: "tri", name: "Triage", kind: "meeting_minutes" },
  { id: "ack", name: "Acknowledgement", kind: "acknowledgement" },
  { id: "st", name: "Carer Statement", kind: "document" },
  { id: "qa", name: "Previous QAs", kind: "document" },
  { id: "find", name: "Findings", kind: "meeting_minutes" },
  { id: "out", name: "Outcome Letter", kind: "outcome_letter" },
  { id: "doc", name: "Duty of Candour Letter", kind: "duty_of_candour" },
  { id: "fu", name: "Follow-up", kind: "meeting_minutes" },
  { id: "other", name: "Other", kind: "document" },
];
const entry = (stageId: string, status: string, formAnswers: Record<string, unknown> = {}, updatedAt = "2026-10-20T10:00:00Z") => ({ stageId, status, formAnswers, updatedAt });

describe("the interim update", () => {
  const record = {
    stageEntries: [entry("form", "done"), entry("tri", "done"), entry("qa", "na")],
    documents: [{ stageId: "st" }],
    pips: [{ carerName: "Sam", status: "open", kind: "pip" }],
  };

  it("lists what is held, never the acknowledgement or Other", () => {
    expect(completedItems(record, stages)).toEqual(["Complaint Form", "Triage", "Carer Statement"]);
  });

  it("lists what is still to come, skipping what was marked not needed", () => {
    expect(outstandingItems(record, stages).map((o) => o.label)).toEqual([
      "Findings",
      "Our letter on what we found",
      "Duty of Candour Letter",
      "Follow-up",
      "Performance improvement plan for Sam: outcome",
    ]);
  });
});

describe("the readiness check", () => {
  const base = { kind: "complaint", people: [{}], documents: [] as { stageId: string | null; fileName: string; uploadedAt: string }[] };

  it("names the gaps, but not the follow-up meeting, which comes after", () => {
    const gaps = findReadinessGaps({ ...base, stageEntries: [entry("form", "done")] }, stages).map((g) => g.id);
    expect(gaps).toContain("meeting_tri");
    expect(gaps).toContain("meeting_find");
    expect(gaps).not.toContain("meeting_fu");
    expect(gaps).toContain("evidence_st");
    expect(gaps).toContain("findings");
  });

  it("flags a duty of candour Findings decided on and nobody sent", () => {
    const gaps = findReadinessGaps({ ...base, stageEntries: [entry("find", "done", { tri_candour: true })] }, stages);
    expect(gaps.map((g) => g.id)).toContain("candour");
  });

  it("says what changed after the letter was drafted", () => {
    const gaps = findReadinessGaps(
      {
        ...base,
        stageEntries: [entry("out", "pending", { body: "Dear…" }, "2026-10-20T10:00:00Z"), entry("tri", "done", {}, "2026-10-21T10:00:00Z")],
        documents: [{ stageId: "st", fileName: "statement.pdf", uploadedAt: "2026-10-22T09:00:00Z" }],
      },
      stages,
    );
    expect(gaps.filter((g) => g.kind === "stale").map((g) => g.id)).toEqual(["new_documents", "stages_moved"]);
  });
});

describe("trends", () => {
  it("counts the last months, oldest first", () => {
    expect(lastMonths("2026-10-29", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(lastMonths("2026-01-05", 2)).toEqual(["2025-12", "2026-01"]);
  });

  it("counts by type, category, carer, client and month", () => {
    const t = concernTrends(
      [
        { kind: "complaint", category: "medication", reportedOn: "2026-10-01", clientId: "c1", clientName: "Mrs A", people: [{ userId: "u1", name: "Sam" }] },
        { kind: "complaint", category: "medication", reportedOn: "2026-09-01", clientId: "c1", clientName: "Mrs A", people: [{ userId: "u1", name: "Sam" }, { userId: "u2", name: "Jo" }] },
        { kind: "accident", category: null, reportedOn: "2026-10-03", clientId: null, clientName: null, people: [] },
      ],
      ["2026-09", "2026-10"],
    );
    expect(t.byType.map((c) => [c.label, c.count])).toEqual([["Complaint", 2], ["Accident", 1]]);
    expect(t.byCategory[0]).toMatchObject({ label: "Medication", count: 2 });
    expect(t.byCarer.map((c) => [c.label, c.count])).toEqual([["Sam", 2], ["Jo", 1]]);
    expect(t.byClient).toHaveLength(1);
    expect(t.byMonth.map((m) => m.count)).toEqual([1, 2]);
  });
});

describe("the guidance", () => {
  it("is in the company's name and lists its councils before CQC and the Ombudsman", () => {
    const g = complaintGuidance("Demo Care Ltd", ["Stockport Council"]);
    expect(g.title).toContain("Demo Care Ltd");
    expect(g.contacts.map((c) => c.name)).toEqual(["Stockport Council", "Care Quality Commission", "Local Government and Social Care Ombudsman"]);
  });
});
