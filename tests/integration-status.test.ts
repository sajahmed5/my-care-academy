import { describe, expect, it } from "vitest";
import { describeProblems } from "@/lib/integration-status";

describe("describeProblems", () => {
  it("says how many carers had no email address, with their names", () => {
    const out = describeProblems([
      { kind: "no_email", name: "Jane Doe", externalRef: "1" },
      { kind: "no_email", name: null, externalRef: "2" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/^2 carers have no email address in MyRoster/);
    expect(out[0].names).toEqual(["Jane Doe", "2"]);
  });

  it("uses the singular for one, and puts missing emails first", () => {
    const out = describeProblems([
      { kind: "other", name: "A", externalRef: "a" },
      { kind: "no_email", name: "B", externalRef: "b" },
    ]);
    expect(out.map((p) => p.text.split(" ").slice(0, 3).join(" "))).toEqual(["1 carer has", "1 carer couldn't"]);
  });

  it("is empty when nothing went wrong", () => {
    expect(describeProblems([])).toEqual([]);
  });
});
