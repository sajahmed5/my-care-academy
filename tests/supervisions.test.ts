import { describe, expect, it } from "vitest";
import {
  MAX_AGREED_ACTIONS,
  dueStatus,
  kindLabel,
  nextDueOf,
  parseAgreedActions,
  type Supervision,
} from "../lib/supervisions";

const NOW = new Date("2026-10-23T12:00:00Z");

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

describe("dueStatus", () => {
  it("says nothing is scheduled rather than inventing a date", () => {
    expect(dueStatus(null, NOW)).toBe("none");
  });

  it("flags a date that has passed", () => {
    expect(dueStatus("2026-10-01", NOW)).toBe("overdue");
  });

  it("separates the next 30 days from what is further out", () => {
    expect(dueStatus("2026-11-10", NOW)).toBe("due_soon");
    expect(dueStatus("2027-04-01", NOW)).toBe("scheduled");
  });
});

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

describe("parseAgreedActions", () => {
  it("takes one action per line", () => {
    expect(parseAgreedActions("Book moving and handling\nChase the DBS")).toEqual([
      "Book moving and handling",
      "Chase the DBS",
    ]);
  });

  it("tidies up what people actually paste", () => {
    expect(parseAgreedActions("- Book training\n\n  * Chase DBS  \n•Order gloves")).toEqual([
      "Book training",
      "Chase DBS",
      "Order gloves",
    ]);
  });

  it("is empty for an empty box", () => {
    expect(parseAgreedActions("")).toEqual([]);
    expect(parseAgreedActions("\n\n   \n")).toEqual([]);
  });

  it("stops at a sane number of actions", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Action ${i}`).join("\n");
    expect(parseAgreedActions(many)).toHaveLength(MAX_AGREED_ACTIONS);
  });

  it("trims an over-long line rather than dropping it", () => {
    const [only] = parseAgreedActions("x".repeat(500));
    expect(only).toHaveLength(200);
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
