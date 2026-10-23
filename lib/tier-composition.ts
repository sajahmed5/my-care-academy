import { PACKAGE_TIERS } from "@/lib/organisations";
import { FEATURES, coreFeatureKeys } from "@/lib/features";

/**
 * What a package includes, as the platform admin's tick matrix. Pure — the
 * save action and the tests share it.
 */

export interface Tick {
  tier: string;
  feature: string;
}

const key = (t: Tick) => `${t.tier}|${t.feature}`;

/**
 * Read the ticked cells off the form. Each checkbox carries "tier|feature".
 * Anything that is not a real package and a real feature is refused outright
 * rather than skipped — a typo here would silently change what customers can
 * reach.
 */
export function parseTicks(
  values: string[],
): { ok: true; ticks: Tick[] } | { ok: false; error: string } {
  const tiers = new Set<string>(PACKAGE_TIERS.map((t) => t.value));
  const features = new Set<string>(FEATURES.map((f) => f.key));
  const ticks: Tick[] = [];
  for (const value of values) {
    const [tier, feature, ...rest] = value.split("|");
    if (rest.length || !tiers.has(tier) || !features.has(feature)) {
      return { ok: false, error: "That form named a package or feature we don't have." };
    }
    ticks.push({ tier, feature });
  }
  return { ok: true, ticks };
}

/**
 * The matrix as it should be stored: what was ticked, plus every core feature
 * in every package. Core features are the training everyone gets, so an
 * untick is ignored rather than honoured — the screen renders them disabled,
 * and this is what holds if someone sends the form by hand.
 */
export function withCore(ticks: Tick[]): Tick[] {
  const all = new Map(ticks.map((t) => [key(t), t]));
  for (const tier of PACKAGE_TIERS) {
    for (const feature of coreFeatureKeys()) {
      const t = { tier: tier.value, feature };
      all.set(key(t), t);
    }
  }
  return [...all.values()];
}

/**
 * Only what changed. The save applies this rather than clearing the table and
 * writing it again: entitlement fails closed, so a delete-all followed by an
 * insert that failed would switch off every feature for every organisation on
 * the platform in one click.
 */
export function diffTicks(
  current: Tick[],
  next: Tick[],
): { added: Tick[]; removed: Tick[] } {
  const have = new Set(current.map(key));
  const want = new Set(next.map(key));
  return {
    added: next.filter((t) => !have.has(key(t))),
    removed: current.filter((t) => !want.has(key(t))),
  };
}
