import { describe, expect, it } from "vitest";
import { cleanBlocks, stillToWrite } from "../lib/policy-library";

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
