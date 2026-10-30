/**
 * org_has_feature() (supabase/migrations/20261025120000) in TypeScript, for
 * deciding many companies at once from rows already read. Pure, so it is
 * tested against the SQL's rules.
 */

/** documents.library is on whenever the compliance pack is. */
export function featureKeysFor(key: string): string[] {
  return key === "documents.library" ? ["documents.library", "documents.compliance_pack"] : [key];
}

/**
 * On if any of the key's names is on: each by the company's own override if
 * it has one, else by its package.
 */
export function orgFeatureOn(
  key: string,
  packageTier: string | null,
  overrides: { feature_key: string; enabled: boolean | null }[],
  tierFeatures: { tier_key: string; feature_key: string }[],
): boolean {
  return featureKeysFor(key).some((k) => {
    const own = overrides.find((o) => o.feature_key === k);
    // coalesce(override, package): a null override falls through to the package.
    if (own && typeof own.enabled === "boolean") return own.enabled;
    return packageTier !== null && tierFeatures.some((t) => t.tier_key === packageTier && t.feature_key === k);
  });
}
