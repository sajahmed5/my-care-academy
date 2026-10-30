/**
 * Package tiers a platform admin can assign. Stripe wires these to flags in
 * Phase 9. Labels are the domiciliary-care package names (issue #10).
 */
export const PACKAGE_TIERS = [
  // Four-tier model (Saj, 9 Sept 2026: a bronze/silver/gold/platinum ladder
  // "with more professional names"), renamed to these on 23 Oct 2026. The
  // labels are the public names; the keys below are internal and unchanged.
  // The keys' old meanings no longer match since the 29 Oct 2026 regroup:
  // core is Starter (training and the HR pack), core_forms is Growth (Staff
  // Audits and the client list), core_recruitment
  // is Pro (complaints, audits, forms and policies). Stripe's price env vars
  // use the keys, so they stay.
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
 * pricing page, from Saj's package sheet (29 Oct 2026, PACKAGES.md).
 *
 * The packages are a ladder: each one includes everything in the one below,
 * so the bullets say "Everything in X" rather than repeating it. That is a
 * claim about tier_features, not just copy — 20261029120000 ticks the rows
 * that make it true, and unticking one on the Packages screen makes this copy
 * a lie.
 */
export const TIER_DETAILS: Record<
  PackageTier,
  { tagline: string; features: string[] }
> = {
  // Regrouped 29 Oct 2026 (PACKAGES.md). Each line describes what is built
  // today: as the HR pack, Staff Audits and the rest grow, so does this copy.
  core: {
    tagline: "Train your whole team, and hire the next one.",
    features: [
      "Full CQC-aligned course library and induction programmes",
      "Unlimited learners and admin users",
      "Certificates with verification and expiry tracking",
      "Training matrix and CSV exports",
      "Automated reminders and weekly digest emails",
      "HR pack: recruitment to leaving: documents, probation, sickness, holidays, disciplinary and grievance",
    ],
  },
  core_forms: {
    tagline: "Check and support your staff.",
    features: [
      "Everything in Starter",
      "Supervisions and appraisals, with agreed actions tracked",
      "Spot checks and competency assessments",
    ],
  },
  core_recruitment: {
    tagline: "Run your whole compliance in one place.",
    features: [
      "Everything in Growth",
      "Complaints, accidents and safeguarding",
      "Client QAs; medication, care plan, infection control, staff file and training audits",
      "A monthly governance report for CQC's well-led question",
      "Forms, and feedback surveys for families and staff",
      "CQC policies and procedures, with who has read each one",
    ],
  },
  full: {
    tagline: "For larger and growing providers.",
    features: [
      "Everything in Pro",
      "Face-to-face training at our Stockport office, with unlimited places",
      "Care Certificate workplace assessment",
      "Your own classroom sessions, with QR sign-in, on the training matrix",
      "White label: your own web address, logo and colour on every page, email and PDF",
      "Rostering integration: MyRoster, or any system through our API, with alerts",
      "Bespoke reports, built for you within 10 working days",
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
