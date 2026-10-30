import type { FeatureKey } from "@/lib/features";

/**
 * The settings tabs, kept apart from the shell so the filter below can be
 * tested without a database.
 */

export interface SettingsPage {
  href: string;
  label: string;
  hint: string;
  /** Shown only when the package has this. Leave out for whenever its group shows. */
  feature?: FeatureKey;
}

export interface SettingsGroup {
  title: string;
  /** Shown when the package has any one of these. Leave out for always. */
  features?: FeatureKey[];
  pages: SettingsPage[];
}

/**
 * Settings, one add-on to a tab (Saj, 30 Oct 2026): each add-on's own forms,
 * questions and wording sit under its own heading, never beside another's.
 * Add a group here and it appears on every settings page. A group shared by
 * two add-ons (Forms: the forms builder and feedback surveys) marks each page
 * with the one it needs, so a package with only one sees only its page.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Your company",
    pages: [
      {
        href: "/org/billing",
        label: "Account and package",
        hint: "Your package and billing, AI drafting, and who has the console.",
      },
    ],
  },
  {
    // The HR pack (HR-PACK.md), all under one heading: recruitment, then
    // employing someone.
    title: "HR",
    features: ["recruitment.tracker"],
    pages: [
      {
        href: "/org/settings/recruitment",
        label: "How you recruit",
        hint: "The steps you use, references, offer letter wording and the welcome pack.",
      },
      {
        href: "/org/settings/recruitment/forms",
        label: "Forms and literacy test",
        hint: "Your own questions on the application, interview and reference forms; the test; rejection reasons and offer conditions.",
      },
      {
        href: "/org/settings/recruitment/documents",
        label: "Documents to sign",
        hint: "Role acceptance, the contract and the refund of training agreement, in your wording.",
      },
      {
        href: "/org/settings/hr",
        label: "Probation",
        hint: "How long probation lasts, when it's reviewed, and who signs HR letters.",
      },
      {
        href: "/org/settings/hr/absence",
        label: "Absence",
        hint: "Whether staff can report sick from their own login, and your Bradford Factor trigger points.",
      },
      {
        href: "/org/settings/hr/holidays",
        label: "Holidays",
        hint: "When your leave year starts, bank holidays, how many can be off at once, and your own kinds of leave.",
      },
      {
        href: "/org/settings/hr/cases",
        label: "Disciplinary and grievance",
        hint: "Notice before a hearing, the appeal window, how long warnings stay active, and which office workers can see cases.",
      },
      {
        href: "/org/settings/hr/letters",
        label: "Letters",
        hint: "The wording of every HR letter. The right to be accompanied and to appeal are always added.",
      },
    ],
  },
  {
    title: "Staff audits",
    features: ["people.supervisions", "people.competency"],
    pages: [
      {
        href: "/org/settings/staff-audits",
        label: "Forms and due periods",
        hint: "The questions on supervisions, appraisals, spot checks and competency, how often each is due, and your own skills.",
      },
    ],
  },
  {
    title: "Forms",
    features: ["forms.builder", "quality.feedback"],
    pages: [
      {
        href: "/org/settings/forms",
        label: "Your forms",
        hint: "Which of our forms you use and how often each is reviewed, your own copies of ours, and forms you build yourself.",
        feature: "forms.builder",
      },
      {
        href: "/org/settings/forms/surveys",
        label: "Feedback surveys",
        hint: "The questions on your client and family survey and your staff survey. A round already started keeps its own.",
        feature: "quality.feedback",
      },
    ],
  },
  {
    title: "Complaints & safeguarding",
    features: ["complaints.register"],
    pages: [
      {
        href: "/org/settings/complaints/process",
        label: "The process",
        hint: "The stages a complaint goes through, and which kinds of concern each applies to.",
      },
      {
        href: "/org/settings/complaints/link",
        label: "Raise-a-concern link",
        hint: "Open, close or replace the link families use. The office can still copy it from the complaints page.",
      },
    ],
  },
  {
    title: "Service audits",
    features: ["quality.audits"],
    pages: [
      {
        href: "/org/settings/service-audits",
        label: "Audits and due periods",
        hint: "The questions on each audit, how often it falls due, your own audits, and the score that needs a manager's review.",
      },
    ],
  },
  {
    title: "Policies & procedures",
    features: ["documents.library"],
    pages: [
      {
        href: "/org/settings/policies",
        label: "Reading, reviews and your details",
        hint: "Who must read each policy and by when, how often they are reviewed, and the details put into every policy you adopt.",
      },
    ],
  },
  {
    title: "Integration",
    features: ["platform.portal_api"],
    pages: [
      {
        href: "/org/settings/integration",
        label: "MyRoster",
        hint: "Connect MyRoster, replace or remove its key, and see how the connection is doing.",
      },
      {
        href: "/org/settings/integration/other",
        label: "Other systems and alerts",
        hint: "Keys for another rota or care system built against our API, and the alerts we send it.",
      },
    ],
  },
  {
    title: "White label",
    features: ["platform.white_label"],
    pages: [
      {
        href: "/org/settings/white-label",
        label: "Logo, colour and emails",
        hint: "Your logo and colour in place of ours, on every page, PDF and email, and who your emails come from.",
      },
      {
        href: "/org/settings/white-label/domain",
        label: "Web address",
        hint: "Your staff sign in at your own address, like training.yourcompany.co.uk, and every emailed link points there.",
      },
    ],
  },
  {
    title: "Bespoke reports",
    features: ["reports.bespoke"],
    pages: [
      {
        href: "/org/settings/reports",
        label: "Who sees them, and emails",
        hint: "Whether office staff see each report, and who it's emailed to, how often and as a PDF or Excel.",
      },
    ],
  },
];

/**
 * The groups, and the pages in them, a package has. A group shows when the
 * package has any of its features; a page in it that names its own feature
 * shows only with that one; a group left with no pages is dropped.
 */
export function visibleSettingsGroups(
  groups: SettingsGroup[],
  enabled: Partial<Record<FeatureKey, boolean>>,
): SettingsGroup[] {
  return groups
    .filter((g) => !g.features || g.features.some((f) => enabled[f]))
    .map((g) => ({ ...g, pages: g.pages.filter((p) => !p.feature || enabled[p.feature]) }))
    .filter((g) => g.pages.length > 0);
}
