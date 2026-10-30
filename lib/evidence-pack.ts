/**
 * What goes into a carer's evidence pack, and what is said about what does
 * not.
 *
 * The pack is the demo that sells the product: an inspector asks for a staff
 * member's file and a manager hands over one dated PDF instead of assembling a
 * folder. Which makes the omissions as important as the contents — a pack that
 * silently leaves out supervisions looks like a provider with no supervisions,
 * so every section the organisation does not have is named on the cover as not
 * included rather than quietly dropped.
 *
 * The section list is deliberately its own, not the carer file's: that one
 * includes areas which link out rather than hold evidence (Forms, Recruitment,
 * the Care Certificate record), and this one is only what can be printed.
 *
 * Pure. The gathering and the rendering live elsewhere.
 */

import type { FeatureKey } from "./features";
import { formatDate } from "./dates";

export interface PackSectionDef {
  key: string;
  label: string;
  /** The feature that unlocks it; null for what every package includes. */
  feature: FeatureKey | null;
}

export const PACK_SECTIONS: PackSectionDef[] = [
  { key: "training", label: "Training record", feature: null },
  { key: "certificates", label: "Certificates", feature: null },
  { key: "actions", label: "Outstanding actions", feature: null },
  { key: "supervisions", label: "Supervisions & appraisals", feature: "people.supervisions" },
  { key: "competency", label: "Spot checks & competency", feature: "people.competency" },
  { key: "complaints", label: "Concerns", feature: "complaints.register" },
  // What they filled in from the forms library, answer by answer (ROADMAP §1).
  { key: "forms", label: "Completed forms", feature: "forms.builder" },
  // Each policy set for them: the version they accepted and when, or that it
  // is still to accept (POLICIES.md, "Records").
  { key: "policies", label: "Policies read and accepted", feature: "documents.library" },
];

export type OmissionReason = "not_in_plan" | "nothing_recorded";

export interface PackContents {
  /** Sections with something to print, in pack order. */
  included: { key: string; label: string; count: number }[];
  /** Sections left out, and why — printed on the cover sheet. */
  omitted: { key: string; label: string; reason: OmissionReason }[];
}

/**
 * Decide what the pack contains from what the organisation has and what the
 * carer has.
 *
 * "Nothing recorded" and "not in your plan" are different facts and are kept
 * apart: the first is about this carer, the second about the customer. An
 * inspector reading "supervisions: nothing recorded" learns something true;
 * reading it when the provider never bought supervisions would be a lie about
 * their practice.
 */
export function packContents({
  enabled,
  counts,
}: {
  enabled: Record<string, boolean>;
  counts: Record<string, number>;
}): PackContents {
  const included: PackContents["included"] = [];
  const omitted: PackContents["omitted"] = [];

  for (const section of PACK_SECTIONS) {
    if (section.feature && !enabled[section.feature]) {
      omitted.push({ key: section.key, label: section.label, reason: "not_in_plan" });
      continue;
    }
    const count = counts[section.key] ?? 0;
    if (count === 0) {
      omitted.push({ key: section.key, label: section.label, reason: "nothing_recorded" });
      continue;
    }
    included.push({ key: section.key, label: section.label, count });
  }

  return { included, omitted };
}

export function omissionLabel(reason: OmissionReason): string {
  return reason === "not_in_plan"
    ? "not included in this organisation's plan"
    : "nothing recorded";
}

/**
 * Keep only what falls on or after `from`.
 *
 * An inspector asks for "since her last supervision" far more often than for
 * four years of history, and a pack nobody can narrow is a pack nobody reads.
 * A row with no date of its own is kept: an undated action is still
 * outstanding, and dropping it would understate what is owed.
 */
export function since<T>(
  rows: T[],
  dateOf: (row: T) => string | null,
  from: string | null,
): T[] {
  if (!from) return rows;
  return rows.filter((row) => {
    const date = dateOf(row);
    return !date || date >= from;
  });
}

/** "1 April 2026 to 23 October 2026", or "everything on file". */
export function rangeLabel(from: string | null, to: Date): string {
  const end = formatDate(to, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (!from) return `Everything on file, up to ${end}`;
  const start = formatDate(from, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${start} to ${end}`;
}
