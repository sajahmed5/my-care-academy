/**
 * Package tiers a platform admin can assign. Stripe wires these to flags in
 * Phase 9. Labels are the domiciliary-care package names (issue #10).
 */
export const PACKAGE_TIERS = [
  // Four-tier model (Saj, 9 Sept 2026: a bronze/silver/gold/platinum ladder
  // "with more professional names"). Prices and contents to be confirmed.
  { value: "core", label: "Essentials" },
  { value: "core_forms", label: "Professional" },
  { value: "core_recruitment", label: "Premier" },
  { value: "full", label: "Enterprise" },
] as const;

export type PackageTier = (typeof PACKAGE_TIERS)[number]["value"];

export function tierLabel(value: string): string {
  return PACKAGE_TIERS.find((t) => t.value === value)?.label ?? value;
}

/**
 * What each package includes, shown on the org Account page. Drafted from
 * what each tier actually enables — awaiting the official package sheet.
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
    tagline: "Training plus your own digital paperwork.",
    features: [
      "Everything in Essentials",
      "Forms builder — custom forms with e-signatures",
      "Form submissions tracked per staff member",
    ],
  },
  core_recruitment: {
    tagline: "Training plus recruitment compliance.",
    features: [
      "Everything in Essentials",
      "Recruitment tracker — candidates and interviews",
      "Document checklist with DBS and right-to-work expiry dates",
    ],
  },
  full: {
    tagline: "The complete platform for growing care providers.",
    features: [
      "Everything in Essentials, Professional and Premier",
      "Forms builder with e-signatures",
      "Recruitment tracker with document expiry alerts",
      "Care Certificate workplace assessment",
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
