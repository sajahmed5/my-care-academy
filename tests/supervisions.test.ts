import { describe, expect, it } from "vitest";
import { kindLabel, nextDueOf, type Supervision } from "../lib/supervisions";

function supervision(over: Partial<Supervision> = {}): Supervision {
  return {
    id: "s1",
    kind: "supervision",
    held_on: "2026-10-01",
    summary: null,
    next_due: null,
    supervisor_name: "A Manager",
    ...over,
  };
}

describe("nextDueOf", () => {
  it("takes the latest record's date, because it supersedes", () => {
    // The loader returns newest first.
    const list = [
      supervision({ id: "new", held_on: "2026-10-01", next_due: "2027-04-01" }),
      supervision({ id: "old", held_on: "2026-04-01", next_due: "2026-10-01" }),
    ];
    expect(nextDueOf(list)).toBe("2027-04-01");
  });

  it("is null when there are none", () => {
    expect(nextDueOf([])).toBeNull();
  });
});

describe("kindLabel", () => {
  it("reads as a manager would say it", () => {
    expect(kindLabel("return_to_work")).toBe("Return to work");
    expect(kindLabel("appraisal")).toBe("Appraisal");
  });

  it("falls back to the raw value for anything unknown", () => {
    expect(kindLabel("something_else")).toBe("something_else");
  });
});
