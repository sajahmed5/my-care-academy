import { describe, expect, it } from "vitest";
import {
  PACK_SECTIONS,
  omissionLabel,
  packContents,
  rangeLabel,
  since,
} from "../lib/evidence-pack";

const ALL_ON = {
  "people.supervisions": true,
  "people.competency": true,
  "complaints.register": true,
  "forms.builder": true,
};

const SOME = { training: 3, certificates: 1, actions: 2, supervisions: 1, competency: 1, complaints: 1, forms: 1 };

describe("packContents", () => {
  it("includes every section that is entitled and has something", () => {
    const { included, omitted } = packContents({ enabled: ALL_ON, counts: SOME });
    expect(included.map((s) => s.key)).toEqual(PACK_SECTIONS.map((s) => s.key));
    expect(omitted).toEqual([]);
  });

  it("keeps the pack's own order, not the order of the counts", () => {
    const { included } = packContents({
      enabled: ALL_ON,
      counts: { complaints: 1, training: 1 },
    });
    expect(included.map((s) => s.key)).toEqual(["training", "complaints"]);
  });

  it("separates what was never bought from what has nothing recorded", () => {
    const { included, omitted } = packContents({
      enabled: { ...ALL_ON, "people.supervisions": false },
      counts: { training: 2, certificates: 0, actions: 0, competency: 0, complaints: 0 },
    });
    expect(included.map((s) => s.key)).toEqual(["training"]);
    expect(omitted).toContainEqual({
      key: "supervisions",
      label: "Supervisions & appraisals",
      reason: "not_in_plan",
    });
    expect(omitted).toContainEqual({
      key: "certificates",
      label: "Certificates",
      reason: "nothing_recorded",
    });
  });

  it("never claims a locked section is merely empty", () => {
    // The distinction is the whole point: "nothing recorded" is a fact about
    // the carer, "not in your plan" a fact about the customer.
    const { omitted } = packContents({
      enabled: { "people.supervisions": false, "people.competency": false, "complaints.register": false },
      counts: {},
    });
    const gated = omitted.filter((s) =>
      ["supervisions", "competency", "complaints"].includes(s.key),
    );
    expect(gated.every((s) => s.reason === "not_in_plan")).toBe(true);
  });

  it("produces an empty pack honestly", () => {
    const { included, omitted } = packContents({ enabled: ALL_ON, counts: {} });
    expect(included).toEqual([]);
    expect(omitted).toHaveLength(PACK_SECTIONS.length);
  });
});

describe("since", () => {
  const rows = [
    { id: "old", on: "2026-01-01" },
    { id: "new", on: "2026-09-01" },
    { id: "undated", on: null },
  ];

  it("takes everything when no date is given", () => {
    expect(since(rows, (r) => r.on, null)).toHaveLength(3);
  });

  it("keeps what falls on or after the date", () => {
    expect(since(rows, (r) => r.on, "2026-09-01").map((r) => r.id)).toEqual([
      "new",
      "undated",
    ]);
  });

  it("keeps undated rows, because they are still outstanding", () => {
    expect(since(rows, (r) => r.on, "2027-01-01").map((r) => r.id)).toEqual([
      "undated",
    ]);
  });
});

describe("the cover sheet wording", () => {
  it("says which kind of omission it is", () => {
    expect(omissionLabel("not_in_plan")).toBe(
      "not included in this organisation's plan",
    );
    expect(omissionLabel("nothing_recorded")).toBe("nothing recorded");
  });

  it("describes the period in words a manager would use", () => {
    const to = new Date("2026-10-23T12:00:00Z");
    expect(rangeLabel(null, to)).toBe("Everything on file, up to 23 October 2026");
    expect(rangeLabel("2026-04-01", to)).toBe("1 April 2026 to 23 October 2026");
  });
});
