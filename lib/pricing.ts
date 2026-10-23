import type { PackageTier } from "./organisations";

/**
 * Monthly list price per package, in pounds. CONFIRMED by Saj on 23 Oct 2026.
 *
 * This is what we tell people a package costs, and — since the agreed-amount
 * field was removed on 24 Oct 2026 as confusing — what platform MRR is counted
 * from. Discounts live in Stripe when billing returns, so a customer's real
 * charge may be lower; MRR here is list price, and says so.
 *
 * The Stripe prices (STRIPE_PRICE_*) are not kept in step automatically. When
 * billing returns they must be created to match these numbers.
 */
export const LIST_PRICE_GBP: Record<PackageTier, number> = {
  core: 49,
  core_forms: 99,
  core_recruitment: 149,
  full: 249,
};

/** The package the pricing page draws attention to. */
export const HIGHLIGHTED_TIER: PackageTier = "core_forms";
