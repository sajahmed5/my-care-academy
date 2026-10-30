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
  { key: "people", label: "Staff Audits" },
  { key: "quality", label: "Quality" },
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
  // Face-to-face: the organisation's own classroom sessions, with who came.
  // Enterprise, with the Care Certificate (PACKAGES.md, 29 Oct 2026).
  {
    key: "training.classroom",
    category: "training",
    label: "Classroom sessions",
    isCore: false,
  },
  // Sessions at our Stockport office, booked by the company and included in
  // the Enterprise price (FACE-TO-FACE.md, 29 Oct 2026).
  {
    key: "training.face_to_face",
    category: "training",
    label: "Face-to-face training",
    isCore: false,
    hint: "Booking our Stockport sessions, under Training in the menu. Sessions are set up under Face to face.",
  },
  {
    key: "recruitment.tracker",
    category: "recruitment",
    label: "Recruitment",
    isCore: false,
  },
  {
    key: "complaints.register",
    category: "complaints",
    label: "Complaints & safeguarding",
    isCore: false,
  },
  {
    key: "forms.builder",
    category: "forms",
    label: "Forms",
    isCore: false,
  },
  // Two versions of the same shelf, sold together since 29 Oct 2026 as one
  // combined pack in Pro. The pack includes the basics: org_has_feature
  // answers documents.library as on whenever the pack is (migration
  // 20261025120000), so every guard on the library already counts the pack.
  {
    key: "documents.library",
    category: "documents",
    label: "Policies & procedures",
    isCore: false,
  },
  {
    key: "documents.compliance_pack",
    category: "documents",
    label: "Policies & procedures (full pack)",
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
  // Performance plans, raised from a supervision, spot check or competency
  // that wasn't met — or, with Complaints & safeguarding, from a complaint.
  // Staff Audits (Growth) since 29 Oct 2026; gated on complaints.register
  // before that.
  {
    key: "people.performance_plans",
    category: "people",
    label: "Performance plans",
    isCore: false,
    hint: "Under Staff audits in the menu, and raised from a carer's file.",
  },
  // The people the service cares for, so spot checks, QAs, audits and
  // concerns link to the same person (PACKAGES.md, Clients, 29 Oct 2026).
  {
    key: "clients.list",
    category: "people",
    label: "Client list",
    isCore: false,
    hint: "Clients, under Clients in the menu: uploaded from a spreadsheet or added one by one.",
  },
  // How the service checks itself (ROADMAP §4).
  {
    key: "quality.audits",
    category: "quality",
    label: "Audits",
    isCore: false,
    hint: "Service audits under Quality in the menu: per-client medication and care plan audits, infection control and the company's own; set up under Settings.",
  },
  {
    key: "quality.feedback",
    category: "quality",
    label: "Client & carer feedback",
    isCore: false,
    hint: "Survey links for families, service users and staff, under Feedback in the menu.",
  },
  {
    key: "platform.white_label",
    category: "platform",
    label: "White-label logo",
    isCore: false,
    hint: "The organisation's logo on its certificates, menu, policies and surveys.",
  },
  {
    key: "platform.portal_api",
    category: "platform",
    label: "Rostering portal integration",
    isCore: false,
    hint: "MyRoster, connected by the company's managers under Settings, Integration.",
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

/** Where a console user lands for a feature their package leaves out. */
export function lockedHref(feature: FeatureKey): string {
  return `/org/locked/${feature}`;
}

interface Lockable {
  href?: string;
  feature?: FeatureKey;
  locked?: boolean;
  children?: { href: string; feature?: FeatureKey; locked?: boolean }[];
}

/**
 * The console's menu: what the package leaves out stays in, marked locked and
 * pointing at the page that says which package has it (Saj, 29 Oct 2026 —
 * hiding it meant a manager never learned it existed). A drop-down whose
 * pages are all locked is marked locked too. Carers keep withoutGated: they
 * never see what their company hasn't bought.
 */
export function withLocks<T extends Lockable>(
  items: readonly T[],
  enabled: Record<string, boolean>,
): T[] {
  const locked = (feature?: FeatureKey) => !!feature && !enabled[feature];
  return items.map((item) => {
    if (item.children) {
      const children = item.children.map((c) =>
        locked(c.feature) ? { ...c, locked: true, href: lockedHref(c.feature!) } : c,
      );
      return { ...item, children, locked: children.every((c) => c.locked) };
    }
    return locked(item.feature)
      ? { ...item, locked: true, href: lockedHref(item.feature!) }
      : item;
  });
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
