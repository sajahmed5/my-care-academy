import { describe, expect, it } from "vitest";
import {
  areaLabel,
  areasOfConcern,
  latestByArea,
  nextDueAcrossAreas,
  outcomeLabel,
  type CompetencyCheck,
} from "../lib/competency";

function check(over: Partial<CompetencyCheck> = {}): CompetencyCheck {
  return {
    id: "c1",
    area: "medication",
    outcome: "met",
    checked_on: "2026-10-01",
    notes: null,
    next_due: null,
    assessor_name: "A Manager",
    criteria: [],
    ...over,
  };
}

// The loader returns newest first, and every function here relies on it.
const history: CompetencyCheck[] = [
  check({ id: "med-new", area: "medication", outcome: "developing", checked_on: "2026-10-01", next_due: "2027-01-01" }),
  check({ id: "mh-new", area: "moving_handling", outcome: "met", checked_on: "2026-09-01", next_due: "2026-11-01" }),
  check({ id: "med-old", area: "medication", outcome: "met", checked_on: "2026-04-01", next_due: "2026-10-01" }),
];

describe("latestByArea", () => {
  it("keeps the most recent check in each area", () => {
    const latest = latestByArea(history);
    expect([...latest.keys()].sort()).toEqual(["medication", "moving_handling"]);
    expect(latest.get("medication")?.id).toBe("med-new");
  });

  it("is empty for a carer with no checks", () => {
    expect(latestByArea([]).size).toBe(0);
  });
});

describe("nextDueAcrossAreas", () => {
  it("takes the soonest, not the latest record's", () => {
    // Medication is booked for January, but moving and handling is due in
    // November — November is what the manager has to act on.
    expect(nextDueAcrossAreas(history)).toBe("2026-11-01");
  });

  it("ignores the superseded check's date", () => {
    // med-old was due 1 Oct, but med-new replaced it.
    expect(nextDueAcrossAreas(history)).not.toBe("2026-10-01");
  });

  it("is null when nothing is scheduled", () => {
    expect(nextDueAcrossAreas([check({ next_due: null })])).toBeNull();
    expect(nextDueAcrossAreas([])).toBeNull();
  });
});

describe("areasOfConcern", () => {
  it("lists the areas whose latest check was not competent", () => {
    expect(areasOfConcern(history).map((c) => c.area)).toEqual(["medication"]);
  });

  it("clears once a later check comes back competent", () => {
    const resolved = [
      check({ id: "med-newest", area: "medication", outcome: "met", checked_on: "2026-10-20" }),
      ...history,
    ];
    expect(areasOfConcern(resolved)).toEqual([]);
  });

  it("counts not competent as well as needs support", () => {
    const both = [
      check({ id: "a", area: "medication", outcome: "not_met" }),
      check({ id: "b", area: "safeguarding", outcome: "developing" }),
    ];
    expect(areasOfConcern(both).map((c) => c.area)).toEqual([
      "medication",
      "safeguarding",
    ]);
  });
});

describe("labels", () => {
  it("read as a manager would say them", () => {
    expect(areaLabel("moving_people")).toBe("Moving and handling people");
    expect(outcomeLabel("developing")).toBe("Needs support");
    expect(outcomeLabel("not_met")).toBe("Not competent");
  });

  it("fall back to the raw value for anything unknown", () => {
    expect(areaLabel("bespoke_thing")).toBe("bespoke_thing");
    expect(outcomeLabel("nope")).toBe("nope");
  });
});
