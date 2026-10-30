import "server-only";
import { chunk } from "@/lib/engine-digest";
import { fetchAll } from "@/lib/fetch-all";
import type { FeatureKey } from "@/lib/features";
import { featureKeysFor, orgFeatureOn } from "@/lib/hr/features-rule";
import type { Admin } from "@/lib/hr/server";

/** Ids per `.in(...)`: a long list of uuids overflows the request URL past ~390. */
export const IDS_PER_REQUEST = 100;

/**
 * Which of these companies have a feature, in a few reads instead of one
 * org_has_feature() call per company — the scheduled jobs asked once for
 * every company with an open case or a leaver. Same answer as
 * org_has_feature() (supabase/migrations/20261025120000): the company's own
 * override if it has one, else its package. Service role only, like
 * hasFeatureForOrg.
 */
export async function orgsWithFeature(admin: Admin, orgIds: string[], key: FeatureKey): Promise<Set<string>> {
  const ids = [...new Set(orgIds)];
  if (!ids.length) return new Set();
  try {
    return await read(admin, ids, key);
  } catch (err) {
    // Fails closed, as hasFeatureForOrg does: nobody is entitled today.
    console.error("orgsWithFeature failed:", err);
    return new Set();
  }
}

async function read(admin: Admin, ids: string[], key: FeatureKey): Promise<Set<string>> {
  const keys = featureKeysFor(key);
  const [tiers, parts] = await Promise.all([
    admin.from("tier_features").select("tier_key, feature_key").in("feature_key", keys),
    Promise.all(
      chunk(ids, IDS_PER_REQUEST).map((part) =>
        Promise.all([
          fetchAll((f, t) => admin.from("organisations").select("id, package_tier").in("id", part).order("id").range(f, t)),
          fetchAll((f, t) =>
            admin
              .from("organisation_features")
              .select("organisation_id, feature_key, enabled")
              .in("organisation_id", part)
              .in("feature_key", keys)
              .order("organisation_id")
              .order("feature_key")
              .range(f, t),
          ),
        ]),
      ),
    ),
  ]);
  if (tiers.error) throw new Error(tiers.error.message);
  const tierRows = (tiers.data ?? []) as { tier_key: string; feature_key: string }[];
  const out = new Set<string>();
  for (const [orgs, overrides] of parts) {
    for (const o of orgs) {
      const id = o.id as string;
      const mine = overrides.filter((r) => r.organisation_id === id) as { feature_key: string; enabled: boolean | null }[];
      if (orgFeatureOn(key, (o.package_tier as string | null) ?? null, mine, tierRows)) out.add(id);
    }
  }
  return out;
}
