/**
 * What a concern is about, and the training that suggests.
 *
 * Moved from the incidents register (lib/incidents.ts, 20261023230000) when
 * it was merged into the one front door on 29 Oct 2026; the values are the
 * ones that register stored, so a copied row keeps its category.
 *
 * A medication complaint and the Medication Awareness course are obviously
 * related, and the platform can say so. What it must never do is act on it:
 * training assigned automatically on receipt of a complaint is a judgement
 * about a carer made by software before anyone investigated, and it survives
 * in the record even when the complaint turns out to be unfounded. So this
 * suggests, the manager accepts, and complaint_training keeps who decided and
 * why.
 *
 * Pure: safe in client components.
 */

/**
 * What it was about, and what that suggests.
 *
 * Course slugs rather than titles or ids: a title is marketing copy that
 * changes, an id differs per environment, and a slug is the stable thing the
 * catalogue already keys on. A slug that no longer exists simply drops out of
 * the suggestions — a missing course must never break a complaint record.
 */
export const CONCERN_CATEGORIES = [
  { value: "medication", label: "Medication", courses: ["medication-awareness", "record-keeping-and-documentation"] },
  { value: "dignity", label: "Dignity & respect", courses: ["privacy-and-dignity", "person-centred-care"] },
  { value: "moving_handling", label: "Moving & handling", courses: ["moving-and-handling", "risk-assessment"] },
  { value: "fall", label: "Fall", courses: ["slips-trips-and-falls", "risk-assessment"] },
  { value: "infection", label: "Infection control", courses: ["infection-prevention-and-control"] },
  { value: "safeguarding", label: "Safeguarding", courses: ["safeguarding-adults-level-2", "duty-of-care"] },
  { value: "missed_visit", label: "Missed or late visit", courses: ["duty-of-care", "lone-working"] },
  { value: "communication", label: "Communication & attitude", courses: ["communication-skills", "complaints-handling"] },
  { value: "behaviour", label: "Behaviour that challenges", courses: ["behaviours-that-challenge", "positive-behaviour-support"] },
  { value: "nutrition", label: "Food, fluids & nutrition", courses: ["fluids-and-nutrition", "food-hygiene-and-nutrition"] },
  { value: "records", label: "Records & confidentiality", courses: ["record-keeping-and-documentation", "information-governance-and-gdpr"] },
  { value: "equality", label: "Equality & inclusion", courses: ["equality-diversity-and-inclusion"] },
  { value: "other", label: "Something else", courses: [] },
] as const;

export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number]["value"];

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "Not said";
  return CONCERN_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export interface CourseRef {
  id: string;
  slug: string;
  title: string;
}

export interface Suggestion {
  course: CourseRef;
  /** Already assigned off this concern — shown as done, not offered again. */
  assigned: boolean;
  /** The manager's reason, when it was assigned. */
  reason?: string | null;
}

/**
 * What this category suggests for one person, in catalogue order.
 *
 * Already-assigned courses stay in the list rather than disappearing: the
 * point of the panel is the decision trail, and "we assigned this on the 3rd"
 * is as much a part of it as "we have not".
 */
export function suggestionsFor({
  category,
  courses,
  assigned,
}: {
  category: string | null | undefined;
  courses: CourseRef[];
  assigned: Map<string, string | null>;
}): Suggestion[] {
  const wanted =
    CONCERN_CATEGORIES.find((c) => c.value === category)?.courses ?? [];
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  return wanted
    .map((slug) => bySlug.get(slug))
    .filter((course): course is CourseRef => !!course)
    .map((course) => ({
      course,
      assigned: assigned.has(course.id),
      reason: assigned.get(course.id) ?? null,
    }));
}
