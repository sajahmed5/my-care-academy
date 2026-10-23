/**
 * Spot checks and competency assessments.
 *
 * The record training cannot give you: a certificate says somebody passed a
 * test about medication, a spot check says somebody watched them give it.
 * Repeated on a schedule, because competence is not earned once.
 *
 * Unlike a supervision, a carer has several of these running at a time — one
 * per area — so the question "when is the next one due?" is answered across
 * areas, from the most recent check in each. The dated-record half it shares
 * with supervisions lives in lib/records.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What gets checked. UI copy, not a database constraint: this list grows with
 * the market, and the column is deliberately free text so adding one is a code
 * change rather than a migration.
 */
export const COMPETENCY_AREAS = [
  { value: "medication", label: "Medication administration" },
  { value: "moving_handling", label: "Moving & handling" },
  { value: "infection_control", label: "Infection prevention & control" },
  { value: "personal_care", label: "Personal care & dignity" },
  { value: "safeguarding", label: "Safeguarding in practice" },
  { value: "record_keeping", label: "Record keeping" },
  { value: "nutrition", label: "Food, fluids & nutrition" },
  { value: "lone_working", label: "Lone working" },
] as const;

/**
 * A closed set, and constrained in the database as such: this is what reports
 * count, and a fourth spelling of "not quite" would quietly change the numbers.
 */
export const COMPETENCY_OUTCOMES = [
  { value: "met", label: "Competent" },
  { value: "developing", label: "Needs support" },
  { value: "not_met", label: "Not competent" },
] as const;

export type CompetencyOutcome = (typeof COMPETENCY_OUTCOMES)[number]["value"];

export function areaLabel(value: string): string {
  return COMPETENCY_AREAS.find((a) => a.value === value)?.label ?? value;
}

export function outcomeLabel(value: string): string {
  return COMPETENCY_OUTCOMES.find((o) => o.value === value)?.label ?? value;
}

export interface CompetencyCheck {
  id: string;
  area: string;
  outcome: string;
  checked_on: string;
  notes: string | null;
  next_due: string | null;
  assessor_name: string | null;
}

/**
 * The most recent check in each area.
 *
 * Expects the loader's order — newest first — because what a manager is asked
 * at inspection is "is this carer competent now", not what they were in March.
 */
export function latestByArea(
  checks: CompetencyCheck[],
): Map<string, CompetencyCheck> {
  const latest = new Map<string, CompetencyCheck>();
  for (const check of checks) {
    if (!latest.has(check.area)) latest.set(check.area, check);
  }
  return latest;
}

/**
 * The soonest next-due date across areas, which is the one that matters: a
 * carer is not "up to date" because their moving and handling is booked if
 * their medication check went out last month.
 */
export function nextDueAcrossAreas(checks: CompetencyCheck[]): string | null {
  const dates = [...latestByArea(checks).values()]
    .map((c) => c.next_due)
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] ?? null;
}

/** Areas whose most recent check did not come back competent. */
export function areasOfConcern(checks: CompetencyCheck[]): CompetencyCheck[] {
  return [...latestByArea(checks).values()]
    .filter((c) => c.outcome !== "met")
    .sort((a, b) => a.area.localeCompare(b.area));
}

export async function loadCompetencyChecks(
  supabase: SupabaseClient,
  userId: string,
): Promise<CompetencyCheck[]> {
  const { data } = await supabase
    .from("competency_checks")
    .select(
      "id, area, outcome, checked_on, notes, next_due, assessor:users!competency_checks_assessor_id_fkey (full_name, email)",
    )
    .eq("user_id", userId)
    .order("checked_on", { ascending: false })
    .limit(200);

  return (data ?? []).map((row) => {
    // PostgREST returns an embedded row as an object, or an array when it
    // cannot prove the relationship is to-one.
    const raw = (row as { assessor?: unknown }).assessor;
    const assessor = (Array.isArray(raw) ? raw[0] : raw) as
      | { full_name?: string | null; email?: string | null }
      | undefined;
    return {
      id: row.id as string,
      area: row.area as string,
      outcome: row.outcome as string,
      checked_on: row.checked_on as string,
      notes: (row.notes as string | null) ?? null,
      next_due: (row.next_due as string | null) ?? null,
      assessor_name: assessor?.full_name ?? assessor?.email ?? null,
    };
  });
}
