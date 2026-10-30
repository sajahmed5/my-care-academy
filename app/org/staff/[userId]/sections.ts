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
    blurb: "Forms this person has been asked to complete, and has.",
    feature: "forms.builder",
    built: true,
  },
  {
    // The carer's documents page (HR-PACK.md): right to work, DBS, references
    // and the rest with their expiries, and a Recruitment sub-page with
    // everything from when they were recruited on the site. It was
    // "Recruitment & right to work" (?section=recruitment) until 31 Oct 2026;
    // the old key still lands here, as those links are in emails.
    key: "documents",
    label: "Documents",
    blurb:
      "Right to work, DBS, references, insurance and the rest, with expiry reminders, and everything from their recruitment.",
    feature: "recruitment.tracker",
    built: true,
  },
  {
    key: "supervisions",
    label: "Supervisions & appraisals",
    blurb:
      "Supervisions and appraisals — booked ahead, held question by question, signed by both, and when the next one is due.",
    feature: "people.supervisions",
    built: true,
  },
  {
    key: "competency",
    label: "Spot checks & competency",
    blurb:
      "Unannounced spot checks in clients' homes, and each skill signed off against its own criteria — repeated on a schedule.",
    feature: "people.competency",
    built: true,
  },
  {
    key: "complaints",
    label: "Concerns & compliments",
    blurb:
      "Complaints, safeguarding concerns, issues, accidents and near misses this person was named in, what came of them, and the training they suggest; and the compliments about them.",
    feature: "complaints.register",
    built: true,
  },
  {
    // Not feature-gated, and deliberately: the list is mostly a view over
    // training, which every package includes. What is paid for is what feeds
    // it — supervision actions exist only where supervisions do.
    key: "actions",
    label: "Actions & tasks",
    blurb:
      "Everything outstanding for this person in one list — training due, certificates expiring, actions agreed with a manager.",
    feature: null,
    built: true,
  },
];

export const DEFAULT_SECTION = "training";

/** Keys a section used to have, still in links people were sent. */
const RENAMED: Record<string, string> = { recruitment: "documents" };

export function sectionByKey(key: string | undefined): SectionDef {
  if (key && RENAMED[key]) key = RENAMED[key];
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
