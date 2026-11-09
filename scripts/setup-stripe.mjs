// Creates the 4 subscription products + monthly prices in Stripe (test mode),
// then prints the price ids to paste into .env.local. Idempotent-ish: it always
// creates new products, so run once.
//
// The amounts follow lib/pricing.ts (Saj, 9 Nov 2026). Training only is per
// carer in marginal bands, which Stripe calls graduated tiers: the quantity on
// the subscription is the carer count, and each carer is charged at the rate
// of the band they fall in. The other three are one flat price a month.
//
//   node scripts/setup-stripe.mjs

import { config } from "dotenv";
config({ path: ".env.local" });
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const stripe = new Stripe(key);

const TIERS = [
  {
    env: "STRIPE_PRICE_CORE",
    name: "My Care Academy — Training only",
    // Pence per carer: carers 1–15, 16–25, 26–50, 51 and over.
    tiers: [
      { up_to: 15, unit_amount: 500 },
      { up_to: 25, unit_amount: 450 },
      { up_to: 50, unit_amount: 400 },
      { up_to: "inf", unit_amount: 350 },
    ],
  },
  { env: "STRIPE_PRICE_CORE_FORMS", name: "My Care Academy — Growth", amount: 30000 },
  { env: "STRIPE_PRICE_CORE_RECRUITMENT", name: "My Care Academy — Pro", amount: 45000 },
  // Enterprise is "from £750": a discount on the subscription brings an
  // agreed quote below this.
  { env: "STRIPE_PRICE_FULL", name: "My Care Academy — Enterprise", amount: 75000 },
];

for (const t of TIERS) {
  const product = await stripe.products.create({ name: t.name });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    recurring: { interval: "month" },
    ...(t.tiers
      ? { billing_scheme: "tiered", tiers_mode: "graduated", tiers: t.tiers }
      : { unit_amount: t.amount }),
  });
  console.log(`${t.env}=${price.id}`);
}
console.log("\nPaste the lines above into .env.local, then restart the dev server.");
