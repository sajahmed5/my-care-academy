import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackageTier } from "@/lib/organisations";

/** Env var holding each tier's Stripe price id. */
const TIER_PRICE_ENV: Record<PackageTier, string> = {
  core: "STRIPE_PRICE_CORE",
  core_forms: "STRIPE_PRICE_CORE_FORMS",
  core_recruitment: "STRIPE_PRICE_CORE_RECRUITMENT",
  full: "STRIPE_PRICE_FULL",
};

export function priceIdForTier(tier: PackageTier): string | undefined {
  return process.env[TIER_PRICE_ENV[tier]];
}

export function tierForPriceId(priceId: string): PackageTier | null {
  for (const tier of Object.keys(TIER_PRICE_ENV) as PackageTier[]) {
    const id = process.env[TIER_PRICE_ENV[tier]];
    if (id && id === priceId) return tier;
  }
  return null;
}

/**
 * Apply a subscription to an organisation: sets its package and the Stripe
 * columns. The webhook calls it.
 *
 * It sets nothing about features. What a package includes lives in
 * tier_features, which a platform admin edits, so setting the package is
 * enough — and billing can no longer overwrite an exception a platform admin
 * set by hand, as the old flag writes could.
 */
export async function applySubscriptionToOrg(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    tier: PackageTier;
    customerId?: string;
    subscriptionId?: string | null;
    status?: string;
  },
): Promise<void> {
  await admin
    .from("organisations")
    .update({
      package_tier: params.tier,
      ...(params.customerId ? { stripe_customer_id: params.customerId } : {}),
      ...(params.subscriptionId !== undefined
        ? { stripe_subscription_id: params.subscriptionId }
        : {}),
      ...(params.status ? { subscription_status: params.status } : {}),
    })
    .eq("id", params.organisationId);
}
