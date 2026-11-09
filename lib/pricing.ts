import type { PackageTier } from "./organisations";

/**
 * What a package costs, in pounds a month. CONFIRMED by Saj on 9 Nov 2026,
 * replacing the 23 Oct figures (£49 / £99 / £149 / £249).
 *
 * Two kinds of price. Training only (`core`) is per carer, in marginal bands:
 * every carer is charged at the rate of the band they fall in, so a team of
 * 20 pays 15 × £5 + 5 × £4.50 = £97.50. Growth, Pro and Enterprise are one
 * flat price for the whole organisation, however many carers it has;
 * Enterprise is a "from" price, quoted for the service.
 *
 * Platform MRR is counted from these (the agreed-amount field was removed
 * on 24 Oct 2026 as confusing). Discounts live in Stripe when billing
 * returns, so a customer's real charge may be lower; MRR is list price, and
 * says so. The Stripe prices (STRIPE_PRICE_*) are not kept in step
 * automatically: scripts/setup-stripe.mjs creates them to match.
 */

/** Flat monthly price of each package above Training only. */
export const FLAT_PRICE_GBP: Record<Exclude<PackageTier, "core">, number> = {
  core_forms: 300,
  core_recruitment: 450,
  full: 750,
};

/** Enterprise is "from £750": the final figure is quoted for the service. */
export const QUOTED_TIER: PackageTier = "full";

/** Training only, per carer a month: carers 1–15, 16–25, 26–50, 51 and over. */
export const CARER_BANDS: readonly { upTo: number; gbp: number }[] = [
  { upTo: 15, gbp: 5 },
  { upTo: 25, gbp: 4.5 },
  { upTo: 50, gbp: 4 },
  { upTo: Infinity, gbp: 3.5 },
];

/** The package the pricing page draws attention to. */
export const HIGHLIGHTED_TIER: PackageTier = "core_forms";

export interface TrainingOnlyPrice {
  carers: number;
  /** Pounds a month, to the penny. */
  total: number;
  /** Each band that applies: how many carers, at what rate. */
  parts: { count: number; gbp: number }[];
}

/** What Training only costs for this many carers, band by band. */
export function trainingOnlyPrice(carers: number): TrainingOnlyPrice {
  const c = Math.max(0, Math.floor(carers));
  const parts: TrainingOnlyPrice["parts"] = [];
  let from = 0;
  let total = 0;
  for (const band of CARER_BANDS) {
    if (c <= from) break;
    const count = Math.min(c, band.upTo) - from;
    parts.push({ count, gbp: band.gbp });
    total += count * band.gbp;
    from = Math.min(c, band.upTo);
  }
  return { carers: c, total: Math.round(total * 100) / 100, parts };
}

/**
 * The team size from which Growth is the cheaper choice: the first carer
 * count where Training only costs more than Growth's flat price (73 with the
 * bands above: 72 carers is £297, 73 is £300.50). A Training only company
 * this size is asked whether it wants to move up (Saj, 9 Nov 2026).
 */
export const GROWTH_FROM_CARERS: number = (() => {
  let n = 1;
  while (trainingOnlyPrice(n).total <= FLAT_PRICE_GBP.core_forms) n += 1;
  return n;
})();

/** Whether a Training only company with this many carers should be offered Growth. */
export const growthIsCheaper = (carers: number): boolean => carers >= GROWTH_FROM_CARERS;

/** What an organisation on this package pays a month at list price. */
export function monthlyListPrice(tier: PackageTier, carers: number): number {
  return tier === "core" ? trainingOnlyPrice(carers).total : FLAT_PRICE_GBP[tier];
}

/** £97.50, £300, £1,250 — pence only when there are some. */
export function gbp(amount: number): string {
  const whole = Number.isInteger(amount);
  return `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "15 × £5 + 5 × £4.50" — the sum behind a Training only price. */
export function trainingOnlySum(price: TrainingOnlyPrice): string {
  return price.parts.map((p) => `${p.count} × ${gbp(p.gbp)}`).join(" + ");
}

/**
 * A package's price as the console shows it: the figure and what it is
 * per. Training only needs the organisation's carer count; without one it
 * shows the top band.
 */
export function priceLabel(tier: PackageTier, carers?: number): { figure: string; per: string } {
  if (tier === "core") {
    if (carers === undefined) return { figure: gbp(CARER_BANDS[0].gbp), per: "per carer a month, less as you grow" };
    const p = trainingOnlyPrice(carers);
    return {
      figure: gbp(p.total),
      per: `a month for ${carers === 1 ? "your 1 carer" : `your ${carers} carers`}`,
    };
  }
  return { figure: `${tier === QUOTED_TIER ? "from " : ""}${gbp(FLAT_PRICE_GBP[tier])}`, per: "a month, unlimited carers" };
}
