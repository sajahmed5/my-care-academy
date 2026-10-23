import { describe, expect, it } from "vitest";
import { diffTicks, parseTicks, withCore } from "../lib/tier-composition";
import { coreFeatureKeys } from "../lib/features";

describe("parseTicks", () => {
  it("reads tier|feature pairs", () => {
    const r = parseTicks(["core_forms|forms.builder", "full|recruitment.tracker"]);
    expect(r).toEqual({
      ok: true,
      ticks: [
        { tier: "core_forms", feature: "forms.builder" },
        { tier: "full", feature: "recruitment.tracker" },
      ],
    });
  });

  it("refuses an unknown package or feature rather than skipping it", () => {
    expect(parseTicks(["platinum|forms.builder"]).ok).toBe(false);
    expect(parseTicks(["full|forms.everything"]).ok).toBe(false);
    expect(parseTicks(["full|forms.builder|extra"]).ok).toBe(false);
  });
});

describe("withCore", () => {
  it("puts every core feature in every package, ticked or not", () => {
    const ticks = withCore([]);
    for (const tier of ["core", "core_forms", "core_recruitment", "full"]) {
      for (const feature of coreFeatureKeys()) {
        expect(ticks).toContainEqual({ tier, feature });
      }
    }
  });

  it("does not duplicate a core feature that was also ticked", () => {
    const ticks = withCore([{ tier: "core", feature: "training.courses" }]);
    const n = ticks.filter((t) => t.tier === "core" && t.feature === "training.courses");
    expect(n).toHaveLength(1);
  });
});

describe("diffTicks", () => {
  const a = { tier: "core_forms", feature: "forms.builder" };
  const b = { tier: "full", feature: "recruitment.tracker" };
  const c = { tier: "full", feature: "documents.library" };

  it("reports only what changed", () => {
    expect(diffTicks([a, b], [b, c])).toEqual({ added: [c], removed: [a] });
  });

  it("is empty when nothing changed", () => {
    expect(diffTicks([a, b], [b, a])).toEqual({ added: [], removed: [] });
  });

  // Saving an unchanged screen must never touch a row — a no-op save cannot be
  // allowed to become a delete-all.
  it("leaves untouched rows out of both lists", () => {
    const { added, removed } = diffTicks([a, b, c], [a, b]);
    expect(added).toEqual([]);
    expect(removed).toEqual([c]);
  });
});
