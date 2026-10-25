/**
 * The feature catalogue — the things a package can include.
 *
 * This mirrors the feature_categories and features rows seeded by
 * supabase/migrations/20261023120000_feature_catalogue.sql. Features are code,
 * not content: a row with no code behind it would be a feature that does not
 * exist, so the catalogue is seeded by migration and never edited from the UI.
 * What a platform admin edits is which features each package includes
 * (tier_features) and per-organisation exceptions (organisation_features).
 *
 * Keeping the keys here as well as in the database buys compile-time safety —
 * a nav item or a page guard naming a feature that does not exist is a type
 * error rather than a gate that silently denies forever. tests/entitlements
 * asserts the two lists agree, because a drifted key looks exactly like a
 * billing bug.
 *
 * Pure: no Supabase import, safe in client components. The server-side
 * resolution lives in lib/entitlements.ts.
 */

export const FEATURE_CATEGORIES = [
  { key: "training", label: "Training" },
  { key: "recruitment", label: "Recruitment" },
  { key: "complaints", label: "Complaints & safeguarding" },
  { key: "forms", label: "Forms" },
  { key: "documents", label: "Documents" },
  { key: "people", label: "Staff records" },
  { key: "platform", label: "Platform & integration" },
] as const;

export type FeatureCategoryKey = (typeof FEATURE_CATEGORIES)[number]["key"];

export const FEATURES = [
  // Core features are in every package and cannot be unticked — everyone gets
  // the training, and learners are unlimited. What varies by package is the
  // price band, not access.
  {
    key: "training.courses",
    category: "training",
    label: "Course library",
    isCore: true,
  },
  {
    key: "training.matrix",
    category: "training",
    label: "Training matrix & exports",
    isCore: true,
  },
  {
    key: "training.programmes",
    category: "training",
    label: "Induction programmes",
    isCore: true,
  },
  {
    key: "training.observations",
    category: "training",
    label: "Care Certificate observations",
    isCore: false,
  },
  {
    key: "recruitment.tracker",
    category: "recruitment",
    label: "Recruitment tracker",
    isCore: false,
  },
  {
    key: "complaints.register",
    category: "complaints",
    label: "Complaints & safeguarding register",
    isCore: false,
  },
  {
    key: "forms.builder",
    category: "forms",
    label: "Forms library",
    isCore: false,
  },
  // Two versions of the same shelf: the basic set, and the full compliance
  // pack. The pack includes the basics: org_has_feature answers
  // documents.library as on whenever the pack is (migration 20261025120000),
  // so every guard on the library already counts the pack.
  {
    key: "documents.library",
    category: "documents",
    label: "Policies & procedures (basic)",
    isCore: false,
  },
  {
    key: "documents.compliance_pack",
    category: "documents",
    label: "Full compliance pack",
    isCore: false,
    hint: "Includes the basic policies and procedures library.",
  },
  // What the employer records about a person. The carer file is where these
  // are read; CARER-FILE.md is the plan they follow.
  {
    key: "people.supervisions",
    category: "people",
    label: "Supervisions & appraisals",
    isCore: false,
    hint: "Appears on each carer's file (Staff, then open a person), not in the menu.",
  },
  {
    key: "people.competency",
    category: "people",
    label: "Spot checks & competency",
    isCore: false,
    hint: "Appears on each carer's file (Staff, then open a person), not in the menu.",
  },
  {
    key: "platform.white_label",
    category: "platform",
    label: "White-label logo",
    isCore: false,
    hint: "Not built yet: switching it on changes nothing.",
  },
  {
    key: "platform.portal_api",
    category: "platform",
    label: "Rostering portal integration",
    isCore: false,
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

/**
 * What a platform admin should know beside the switch: where a feature shows
 * up when it is somewhere other than the menu, or that it is not built yet
 * (#76, #77 — "always on" looked broken when nothing appeared to change).
 */
export function featureHint(key: string): string | null {
  const f = FEATURES.find((x) => x.key === key);
  return f && "hint" in f ? f.hint : null;
}

/** The catalogue label, falling back to the raw key for an unknown one. */
export function featureLabel(key: string): string {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}

/** The features of one category, in catalogue order. */
export function featuresInCategory(category: FeatureCategoryKey) {
  return FEATURES.filter((f) => f.category === category);
}

/** Keys every package includes, whatever the tier matrix says. */
export function coreFeatureKeys(): FeatureKey[] {
  return FEATURES.filter((f) => f.isCore).map((f) => f.key);
}

interface Gated {
  feature?: FeatureKey;
  children?: { feature?: FeatureKey }[];
}

/**
 * Drop the nav entries an organisation does not have, children included.
 *
 * Children are filtered on the item itself, so anything that reads
 * `item.children` later — the desktop panel and the mobile strip alike — sees
 * the same filtered list. A section left with no pages at all is dropped with
 * them, rather than showing as an empty heading.
 */
export function withoutGated<T extends Gated>(
  items: readonly T[],
  enabled: Record<string, boolean>,
): T[] {
  const allowed = (feature?: FeatureKey) => !feature || !!enabled[feature];
  return items
    .filter((item) => allowed(item.feature))
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter((c) => allowed(c.feature)) }
        : item,
    )
    .filter((item) => !item.children || item.children.length > 0);
}
