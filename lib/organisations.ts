/**
 * Package tiers a platform admin can assign. Stripe wires these to flags in
 * Phase 9. Labels are the domiciliary-care package names (issue #10).
 */
export const PACKAGE_TIERS = [
  // Four-tier model (Saj, 9 Sept 2026: a bronze/silver/gold/platinum ladder
  // "with more professional names"), renamed to these on 23 Oct 2026. The
  // labels are the public names; the keys below are internal and unchanged.
  // Prices and contents to be confirmed.
  { value: "core", label: "Starter" },
  { value: "core_forms", label: "Growth" },
  { value: "core_recruitment", label: "Pro" },
  { value: "full", label: "Enterprise" },
] as const;

export type PackageTier = (typeof PACKAGE_TIERS)[number]["value"];

export function tierLabel(value: string): string {
  return PACKAGE_TIERS.find((t) => t.value === value)?.label ?? value;
}

/**
 * What each package includes, shown on the org Account page and the public
 * pricing page. Drafted from what each tier actually enables — awaiting the
 * official package sheet.
 *
 * The packages are a ladder: each one includes everything in the one below,
 * so the bullets say "Everything in X" rather than repeating it. That is a
 * claim about tier_features, not just copy — 20261023190000 ticks the rows
 * that make it true, and unticking one on the Packages screen makes this copy
 * a lie.
 */
export const TIER_DETAILS: Record<
  PackageTier,
  { tagline: string; features: string[] }
> = {
  core: {
    tagline: "Everything a care team needs to train and stay compliant.",
    features: [
      "Full CQC-aligned course library",
      "Unlimited learners and admin users",
      "Certificates with verification and expiry tracking",
      "Training matrix and CSV exports",
      "Automated reminders and weekly digest emails",
    ],
  },
  core_forms: {
    tagline: "Training plus your own paperwork.",
    features: [
      "Everything in Starter",
      "Forms builder — custom forms with e-signatures",
      "Form submissions tracked per staff member",
      "Policies & procedures library",
    ],
  },
  core_recruitment: {
    tagline: "Everything it takes to run compliance, not just training.",
    features: [
      "Everything in Growth",
      "Recruitment tracker — candidates, interviews and DBS expiry",
      "Complaints, accidents and safeguarding register",
      "Supervisions and appraisals, with agreed actions tracked",
      "Spot checks and competency assessments",
      "Full compliance pack of policies and procedures",
    ],
  },
  full: {
    tagline: "The complete platform for growing care providers.",
    features: [
      "Everything in Pro",
      "Care Certificate workplace assessment",
      "Your own branding on certificates and the portal",
      "Rostering system integration",
      "Priority support",
    ],
  },
};

export const ORG_STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;

export type OrgStatus = (typeof ORG_STATUSES)[number]["value"];

/**
 * What an organisation is, which decides which documents and forms it sees.
 * Not courses — the whole library is available to everyone.
 */
export const SERVICE_TYPES = [
  { value: "homecare", label: "Homecare" },
  { value: "care_home", label: "Care home" },
  { value: "both", label: "Both" },
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number]["value"];

export function serviceTypeLabel(value: string | null): string {
  if (!value) return "Not set";
  return SERVICE_TYPES.find((t) => t.value === value)?.label ?? value;
}

/**
 * Size bands. Learners are unlimited on every package and no invite is ever
 * blocked — the band is what the monthly price is agreed against, because a
 * flat fee is too steep for a service with a handful of staff.
 *
 * Nothing enforces a band. When an organisation grows past the one recorded
 * against it, the platform admin sees that and decides when to re-price; a
 * customer's price never moves on its own.
 */
export const SIZE_BANDS = [
  { value: "under_10", label: "Under 10 staff", min: 0, max: 9 },
  { value: "10_to_25", label: "10–25 staff", min: 10, max: 25 },
  { value: "over_25", label: "25+ staff", min: 26, max: null },
] as const;

export type SizeBand = (typeof SIZE_BANDS)[number]["value"];

export function sizeBandLabel(value: string | null): string {
  if (!value) return "Not set";
  return SIZE_BANDS.find((b) => b.value === value)?.label ?? value;
}

/** The band a headcount actually falls in, for comparison with the recorded one. */
export function bandForHeadcount(learners: number): SizeBand {
  if (learners <= 9) return "under_10";
  if (learners <= 25) return "10_to_25";
  return "over_25";
}

/**
 * Whether current staff have grown past the band recorded against an
 * organisation — the signal to look at its price. An organisation with no band
 * recorded has nothing to outgrow.
 */
export function hasOutgrownBand(recorded: string | null, staff: number): boolean {
  if (!recorded) return false;
  const order: string[] = SIZE_BANDS.map((b) => b.value);
  const recordedAt = order.indexOf(recorded);
  return recordedAt >= 0 && order.indexOf(bandForHeadcount(staff)) > recordedAt;
}
