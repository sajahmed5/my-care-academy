import { describe, expect, it } from "vitest";
import { appliesTo, byCategory, cleanBlocks, stillToWrite } from "../lib/policy-library";

describe("an organisation's copy, before it can go to staff", () => {
  it("counts each guidance note and each [bracketed] fill-in still to write", () => {
    expect(
      stillToWrite([
        { type: "heading", text: "Infection control" },
        { type: "guidance", text: "[Describe your arrangements]" },
        { type: "paragraph", text: "Version: [X.X] | Approved: [DD/MM/YYYY]" },
        { type: "paragraph", text: "Hands are washed before and after every visit." },
      ]),
    ).toEqual({ guidance: 1, fillIns: 2 });
    expect(stillToWrite([{ type: "paragraph", text: "All written." }])).toEqual({ guidance: 0, fillIns: 0 });
  });

  it("keeps only the block shapes the renderer knows, and drops empty ones", () => {
    expect(cleanBlocks([{ type: "paragraph", text: "Kept" }, { type: "bullet", text: "  " }])).toEqual([
      { type: "paragraph", text: "Kept" },
    ]);
    expect(cleanBlocks([{ type: "script", text: "x" }])).toBeNull();
    expect(cleanBlocks("not a list")).toBeNull();
  });
});

describe("appliesTo", () => {
  it("shows a company the version for its service, and the domiciliary one when it has not said", () => {
    expect(appliesTo(["homecare"], "homecare")).toBe(true);
    expect(appliesTo(["care_home"], "homecare")).toBe(false);
    expect(appliesTo(["care_home"], "care_home")).toBe(true);
    expect(appliesTo(["homecare"], null)).toBe(true);
    expect(appliesTo(["care_home"], null)).toBe(false);
    expect(appliesTo(["care_home"], "both")).toBe(true);
    expect(appliesTo(null, "care_home")).toBe(true);
  });
});

describe("byCategory", () => {
  it("puts the topics in their order, and an unknown one last", () => {
    const groups = byCategory([
      { category: "Governance and quality" },
      { category: "Something new" },
      { category: "Care and support" },
      { category: "Governance and quality" },
    ]);
    expect(groups.map(([c, items]) => [c, items.length])).toEqual([
      ["Care and support", 1],
      ["Governance and quality", 2],
      ["Something new", 1],
    ]);
  });
});
