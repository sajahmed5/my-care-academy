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
import { COMPETENCY_FORMS, type CheckAnswer } from "./audit-forms";
import type { CourseRef, Suggestion } from "./incidents";

/**
 * The skill areas, from the competency forms (lib/audit-forms.ts). The column
 * is free text, so a company's own areas (part 3) need no migration; a
 * record's label falls back to its key if an area is later removed.
 */
export const COMPETENCY_AREAS = COMPETENCY_FORMS.map((f) => ({ value: f.key, label: f.label }));

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

/** The same three outcomes, as a spot check says them. */
export const SPOT_CHECK_OUTCOMES = [
  { value: "met", label: "Met the standard" },
  { value: "developing", label: "Some concerns" },
  { value: "not_met", label: "Did not meet the standard" },
] as const;

export function spotOutcomeLabel(value: string): string {
  return SPOT_CHECK_OUTCOMES.find((o) => o.value === value)?.label ?? value;
}

export interface CompetencyCheck {
  id: string;
  area: string;
  outcome: string;
  checked_on: string;
  notes: string | null;
  next_due: string | null;
  assessor_name: string | null;
  /** The area's criteria as assessed (STAFF-AUDITS.md). */
  criteria: CheckAnswer[];
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
      "id, area, outcome, checked_on, notes, next_due, criteria, assessor:users!competency_checks_assessor_id_fkey (full_name, email)",
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
      criteria: Array.isArray(row.criteria) ? (row.criteria as CheckAnswer[]) : [],
    };
  });
}

// ---------------------------------------------------------------- spot checks

export interface SpotCheck {
  id: string;
  checked_on: string;
  client_id: string | null;
  client_name: string | null;
  items: CheckAnswer[];
  outcome: string;
  notes: string | null;
  next_due: string | null;
  assessor_name: string | null;
  carer_signature: string | null;
  carer_signed_name: string | null;
  carer_signed_at: string | null;
  carer_unsigned_reason: string | null;
}

/** One carer's spot checks, newest first. */
export async function loadSpotChecks(supabase: SupabaseClient, userId: string): Promise<SpotCheck[]> {
  const { data } = await supabase
    .from("spot_checks")
    .select(
      "id, checked_on, client_id, client_name, items, outcome, notes, next_due, carer_signature, carer_signed_name, carer_signed_at, carer_unsigned_reason, assessor:users!spot_checks_assessor_id_fkey (full_name, email)",
    )
    .eq("user_id", userId)
    .order("checked_on", { ascending: false })
    .limit(100);
  return (data ?? []).map((row) => {
    const raw = (row as { assessor?: unknown }).assessor;
    const assessor = (Array.isArray(raw) ? raw[0] : raw) as { full_name?: string | null; email?: string | null } | undefined;
    return {
      id: row.id as string,
      checked_on: row.checked_on as string,
      client_id: (row.client_id as string | null) ?? null,
      client_name: (row.client_name as string | null) ?? null,
      items: Array.isArray(row.items) ? (row.items as CheckAnswer[]) : [],
      outcome: row.outcome as string,
      notes: (row.notes as string | null) ?? null,
      next_due: (row.next_due as string | null) ?? null,
      assessor_name: assessor?.full_name ?? assessor?.email ?? null,
      carer_signature: (row.carer_signature as string | null) ?? null,
      carer_signed_name: (row.carer_signed_name as string | null) ?? null,
      carer_signed_at: (row.carer_signed_at as string | null) ?? null,
      carer_unsigned_reason: (row.carer_unsigned_reason as string | null) ?? null,
    };
  });
}

/** Courses already assigned off each record, for one person: "type:id" → course_id → reason. */
export async function loadAuditTraining(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, Map<string, string | null>>> {
  const { data } = await supabase
    .from("staff_audit_training")
    .select("source_type, source_id, course_id, reason")
    .eq("user_id", userId)
    .limit(500);
  const out = new Map<string, Map<string, string | null>>();
  for (const r of data ?? []) {
    const key = `${r.source_type}:${r.source_id}`;
    const m = out.get(key) ?? new Map<string, string | null>();
    m.set(r.course_id as string, (r.reason as string | null) ?? null);
    out.set(key, m);
  }
  return out;
}

/**
 * Suggested courses for one record, in the order the form lists them, each
 * flagged if already assigned off it — kept rather than hidden, because the
 * decision trail is the point (as suggestionsFor() does for incidents).
 */
export function suggestionsFromSlugs(
  slugs: string[],
  courses: CourseRef[],
  assigned: Map<string, string | null>,
): Suggestion[] {
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((c): c is CourseRef => !!c)
    .map((course) => ({ course, assigned: assigned.has(course.id), reason: assigned.get(course.id) ?? null }));
}
