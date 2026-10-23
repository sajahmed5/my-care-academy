import type { FeatureKey } from "@/lib/features";

/**
 * The sections of a carer's file. See CARER-FILE.md.
 *
 * The page is the whole file on a person, not just their training: an
 * inspector asks for everything about one carer, and a manager should not have
 * to assemble it from five areas. Every compliance area we add later becomes
 * one more entry here rather than one more item in the nav.
 *
 * Sections that do not exist yet are listed anyway, as "planned". A customer
 * who cannot see that supervisions are coming has no reason to ask for them.
 */

export type SectionState =
  /** Entitled and built — render it. */
  | "open"
  /** Built, but this organisation's package does not include it. */
  | "locked"
  /** Not built yet, for anyone. */
  | "planned";

export interface SectionDef {
  /** `?section=` value, and the anchor id. */
  key: string;
  label: string;
  /** One line shown when the section is locked or planned. */
  blurb: string;
  /**
   * The catalogue feature that unlocks it. Null for the sections every package
   * includes — training is core, and a file with no training in it is not a
   * file.
   */
  feature: FeatureKey | null;
  /**
   * False until there is something behind it. A locked section says "your plan
   * doesn't include this", which is a promise; an unbuilt one must never say
   * it, however the packages are ticked. complaints.register is the live
   * example: it is sellable on the Packages screen today and has no pages at
   * all.
   */
  built: boolean;
  /** Where the area lives today, for sections built outside this page. */
  href?: string;
  hrefLabel?: string;
}

export const SECTIONS: SectionDef[] = [
  {
    key: "training",
    label: "Training",
    blurb: "Courses assigned, progress, assessments and due dates.",
    feature: null,
    built: true,
  },
  {
    key: "certificates",
    label: "Certificates",
    blurb: "Every certificate earned, with expiry dates.",
    feature: null,
    built: true,
  },
  {
    key: "care-certificate",
    label: "Care Certificate",
    blurb: "The 15 standards, with workplace observations signed off by an assessor.",
    feature: "training.observations",
    built: true,
    hrefLabel: "Open the Care Certificate record",
  },
  {
    key: "forms",
    label: "Forms",
    blurb: "Forms this person has completed and signed.",
    feature: "forms.builder",
    built: true,
    href: "/org/forms",
    hrefLabel: "Open Forms",
  },
  {
    key: "recruitment",
    label: "Recruitment & right to work",
    blurb:
      "DBS, right to work, references and documents, with their expiry dates. Today the tracker covers candidates; current staff are next.",
    feature: "recruitment.tracker",
    built: true,
    href: "/org/recruitment",
    hrefLabel: "Open Recruitment",
  },
  {
    key: "supervisions",
    label: "Supervisions & appraisals",
    blurb:
      "Scheduled supervisions and annual appraisals, with what was agreed and who signed it.",
    feature: null,
    built: false,
  },
  {
    key: "competency",
    label: "Spot checks & competency",
    blurb:
      "Medication competency, moving and handling, infection control — repeated on a schedule.",
    feature: null,
    built: false,
  },
  {
    key: "complaints",
    label: "Complaints & incidents",
    blurb:
      "Complaints, accidents and safeguarding concerns this person was involved in, and what came of them.",
    feature: "complaints.register",
    built: false,
  },
  {
    key: "actions",
    label: "Actions & tasks",
    blurb:
      "Everything outstanding for this person in one list — training due, documents expiring, actions agreed in a supervision.",
    feature: null,
    built: false,
  },
];

export const DEFAULT_SECTION = "training";

export function sectionByKey(key: string | undefined): SectionDef {
  return (
    SECTIONS.find((s) => s.key === key) ??
    SECTIONS.find((s) => s.key === DEFAULT_SECTION)!
  );
}

/**
 * Resolve what to render. Unbuilt beats unentitled deliberately: if a feature
 * is ticked into a package before the pages exist, the customer is told it is
 * coming, not shown an empty area they have paid for.
 */
export function sectionState(
  section: SectionDef,
  enabled: Record<FeatureKey, boolean>,
): SectionState {
  if (!section.built) return "planned";
  if (!section.feature) return "open";
  return enabled[section.feature] ? "open" : "locked";
}
