import { describe, expect, it } from "vitest";
import {
  CARER_BANDS,
  FLAT_PRICE_GBP,
  GROWTH_FROM_CARERS,
  gbp,
  growthIsCheaper,
  monthlyListPrice,
  priceLabel,
  trainingOnlyPrice,
  trainingOnlySum,
} from "../lib/pricing";

/**
 * Training only is per carer in marginal bands (Saj, 9 Nov 2026): the first
 * 15 at £5, 16–25 at £4.50, 26–50 at £4, 51 and over at £3.50. Every carer is
 * charged at the rate of the band they fall in, like income tax — not the
 * whole team at the rate of the band the team size lands in.
 */
describe("Training only, per carer", () => {
  it("is Saj's bands", () => {
    expect(CARER_BANDS.map((b) => [b.upTo, b.gbp])).toEqual([
      [15, 5],
      [25, 4.5],
      [50, 4],
      [Infinity, 3.5],
    ]);
  });

  it("charges each carer at their own band's rate", () => {
    expect(trainingOnlyPrice(1).total).toBe(5);
    expect(trainingOnlyPrice(15).total).toBe(75);
    expect(trainingOnlyPrice(16).total).toBe(79.5);
    // Saj's example: 20 staff is the first 15 at £5 and 16–20 at £4.50.
    expect(trainingOnlyPrice(20)).toEqual({
      carers: 20,
      total: 97.5,
      parts: [
        { count: 15, gbp: 5 },
        { count: 5, gbp: 4.5 },
      ],
    });
    expect(trainingOnlyPrice(25).total).toBe(120);
    expect(trainingOnlyPrice(50).total).toBe(220);
    expect(trainingOnlyPrice(51).total).toBe(223.5);
    expect(trainingOnlyPrice(100).total).toBe(395);
  });

  it("is nothing for no carers, and never negative", () => {
    expect(trainingOnlyPrice(0)).toEqual({ carers: 0, total: 0, parts: [] });
    expect(trainingOnlyPrice(-3).total).toBe(0);
  });

  it("spells the sum out", () => {
    expect(trainingOnlySum(trainingOnlyPrice(20))).toBe("15 × £5 + 5 × £4.50");
    expect(trainingOnlySum(trainingOnlyPrice(73))).toBe("15 × £5 + 10 × £4.50 + 25 × £4 + 23 × £3.50");
  });
});

describe("the packages above it", () => {
  it("are flat: £300, £450 and from £750", () => {
    expect(FLAT_PRICE_GBP).toEqual({ core_forms: 300, core_recruitment: 450, full: 750 });
    expect(monthlyListPrice("core_forms", 500)).toBe(300);
    expect(monthlyListPrice("core", 20)).toBe(97.5);
  });

  it("offer Growth from the team size where it is cheaper: 73 carers", () => {
    // 72 carers on Training only is £297; 73 is £300.50, past Growth's £300.
    expect(trainingOnlyPrice(72).total).toBe(297);
    expect(trainingOnlyPrice(73).total).toBe(300.5);
    expect(GROWTH_FROM_CARERS).toBe(73);
    expect(growthIsCheaper(72)).toBe(false);
    expect(growthIsCheaper(73)).toBe(true);
  });
});

describe("how a price reads", () => {
  it("shows pence only when there are some", () => {
    expect(gbp(300)).toBe("£300");
    expect(gbp(97.5)).toBe("£97.50");
    expect(gbp(4.5)).toBe("£4.50");
    expect(gbp(1250)).toBe("£1,250");
  });

  it("labels each package for the console", () => {
    expect(priceLabel("core_forms")).toEqual({ figure: "£300", per: "a month, unlimited carers" });
    expect(priceLabel("full")).toEqual({ figure: "from £750", per: "a month, unlimited carers" });
    expect(priceLabel("core", 20)).toEqual({ figure: "£97.50", per: "a month for your 20 carers" });
    expect(priceLabel("core", 1)).toEqual({ figure: "£5", per: "a month for your 1 carer" });
    expect(priceLabel("core")).toEqual({ figure: "£5", per: "per carer a month, less as you grow" });
  });
});
