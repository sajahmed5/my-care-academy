import { describe, expect, it } from "vitest";
import {
  autoFindings,
  autoTally,
  buildStaffFileSnapshot,
  buildTrainingSnapshot,
  combinedScore,
  trainingCompliance,
} from "../lib/auto-audits";

const now = new Date("2026-10-30T12:00:00Z");
const doc = (user_id: string, doc_type: string, extra: Record<string, unknown> = {}) => ({
  id: `${user_id}-${doc_type}`,
  user_id,
  doc_type,
  file_name: "f.pdf",
  file_path: "p",
  expires_at: null,
  not_required: false,
  not_required_reason: null,
  ...extra,
});

describe("the staff file audit", () => {
  const s = buildStaffFileSnapshot(
    [
      { id: "a", name: "Ann", joinedOn: "2025-01-01" },
      { id: "b", name: "Bob", joinedOn: "2026-09-01" },
    ],
    [
      doc("a", "dbs", { expires_at: "2027-06-01" }),
      doc("a", "right_to_work", { expires_at: "2026-10-01" }),
      doc("a", "references", { not_required: true, file_path: null, not_required_reason: "Agency" }),
      doc("b", "dbs", { expires_at: "2026-11-10" }),
    ],
    [{ user_id: "a", held_on: "2025-07-01" }],
    now,
  );

  it("checks each document from the HR pack", () => {
    const ann = s.people[0].checks;
    expect(ann.dbs).toMatchObject({ result: "pass" });
    expect(ann.right_to_work).toMatchObject({ result: "fail", detail: "Expired 1 Oct 2026" });
    expect(ann.references).toEqual({ result: "na", detail: "Not needed: Agency" });
    const bob = s.people[1].checks;
    expect(bob.dbs.result).toBe("pass");
    expect(bob.dbs.detail).toContain("renew soon");
    expect(bob.references).toEqual({ result: "fail", detail: "Not on file" });
  });

  it("counts probation done once reviewed, and not yet due for a new starter", () => {
    expect(s.people[0].checks.probation).toEqual({ result: "pass", detail: "Reviewed 1 Jul 2025" });
    expect(s.people[1].checks.probation).toEqual({ result: "na", detail: "Not due until 1 Mar 2027" });
    const late = buildStaffFileSnapshot([{ id: "c", name: "Cy", joinedOn: "2025-01-01" }], [], [], now);
    expect(late.people[0].checks.probation.result).toBe("fail");
  });

  it("tallies what was met, and lists who has something to put right", () => {
    expect(autoTally(s)).toEqual({ pass: 3, fail: 3 });
    expect(autoFindings(s).map((f) => [f.person.name, f.failing.length])).toEqual([
      ["Ann", 1],
      ["Bob", 2],
    ]);
  });
});

describe("the training audit", () => {
  const s = buildTrainingSnapshot([
    { id: "a", name: "Ann", assigned: 10, completed: 10, overdue: 0, expired: 0 },
    { id: "b", name: "Bob", assigned: 10, completed: 6, overdue: 1, expired: 2 },
    { id: "c", name: "Cy", assigned: 0, completed: 0, overdue: 0, expired: 0 },
  ]);
  it("is up to date with training assigned and nothing overdue or expired", () => {
    expect(s.people.map((p) => p.checks.training.result)).toEqual(["pass", "fail", "fail"]);
    expect(s.people[1].checks.training.detail).toBe("1 overdue, 2 expired · 6 of 10 done");
    expect(s.people[2].checks.training.detail).toBe("No training assigned");
  });
  it("works out compliance across every assigned course", () => {
    expect(trainingCompliance(s.summary)).toBe(80);
    expect(trainingCompliance({ assigned: 0, completed: 0, overdue: 0, expired: 0 })).toBeNull();
  });
});

describe("the score", () => {
  it("counts each check and each scored question once", () => {
    expect(combinedScore({ pass: 3, fail: 1 }, { met: 1, total: 1 })).toBe(80);
    expect(combinedScore({ pass: 0, fail: 0 }, { met: 0, total: 0 })).toBeNull();
  });
});
