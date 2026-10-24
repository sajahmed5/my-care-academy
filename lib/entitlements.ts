import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { FEATURES, type FeatureKey } from "@/lib/features";
import type { UserContext } from "@/lib/auth";

/**
 * What the signed-in user's organisation is entitled to, resolved by the
 * database — the same has_feature() the RLS policies call, so a page guard and
 * the row-level gate can never disagree about whether a feature is on.
 *
 * Replaces the per-feature guards that each ran their own `select` on
 * organisations: assertForms, assertRecruitment, and the copies of the same
 * block in every gated page.
 */

const NONE: ReadonlySet<FeatureKey> = new Set();

/**
 * Every enabled feature, in one round trip, once per request.
 *
 * React `cache` memoises across a single render pass — the shell, the page and
 * anything nested share one call. It is not a data cache: the next request
 * asks again, so a platform admin's change takes effect on the next
 * navigation. That is also why entitlement is never put in the JWT.
 *
 * Fails closed. If the call errors, the organisation has nothing — the same
 * answer the database gives when there is no override and no package tick.
 */
export const loadEntitlements = cache(
  async (): Promise<ReadonlySet<FeatureKey>> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("my_entitlements");
      if (error || !Array.isArray(data)) return NONE;
      return new Set(data as FeatureKey[]);
    } catch {
      return NONE;
    }
  },
);

/**
 * Whether this user's organisation has a feature.
 *
 * A platform admin always passes: they have no organisation for has_feature()
 * to look at, and every gated RLS policy already gives them their own branch.
 */
export async function hasFeature(
  context: UserContext,
  key: FeatureKey,
): Promise<boolean> {
  if (context.role === "platform_admin") return true;
  if (!context.organisationId) return false;
  return (await loadEntitlements()).has(key);
}

/** Redirect away unless the organisation has the feature. */
export async function requireFeature(
  context: UserContext,
  key: FeatureKey,
  redirectTo = "/org",
): Promise<void> {
  if (!(await hasFeature(context, key))) redirect(redirectTo);
}

/**
 * Every catalogue feature as on/off, for the nav and dashboard panels.
 *
 * One read of the cached set, not one await per feature: the answer is the
 * same either way (the shell, the page and this all share loadEntitlements'
 * single my_entitlements call), but there is no reason to queue thirteen
 * microtask hops behind each other to build it.
 */
export async function enabledMap(
  context: UserContext,
): Promise<Record<FeatureKey, boolean>> {
  const all = context.role === "platform_admin";
  const set =
    all || !context.organisationId ? NONE : await loadEntitlements();
  const map = {} as Record<FeatureKey, boolean>;
  for (const feature of FEATURES) {
    map[feature.key] = all || set.has(feature.key);
  }
  return map;
}

/**
 * For code running as the service role, which has no signed-in organisation of
 * its own — a route handler that bypasses RLS to read storage, say. Asks for a
 * named organisation instead. Must only ever be handed the service-role client:
 * org_has_feature() is not callable by signed-in users, by design.
 */
export async function hasFeatureForOrg(
  admin: SupabaseClient,
  organisationId: string,
  key: FeatureKey,
): Promise<boolean> {
  const { data, error } = await admin.rpc("org_has_feature", {
    p_org: organisationId,
    p_feature: key,
  });
  if (error) return false;
  return data === true;
}
