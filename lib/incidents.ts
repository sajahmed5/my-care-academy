/**
 * Complaints, accidents, near misses and safeguarding concerns.
 *
 * The register half is ordinary: what happened, who was involved, what came of
 * it. The half worth reading carefully is the suggestion engine at the bottom.
 *
 * A medication complaint and the Medication Awareness course are obviously
 * related, and the platform can say so. What it must never do is act on it:
 * training assigned automatically on receipt of a complaint is a judgement
 * about a carer made by software before anyone investigated, and it survives
 * in the record even when the complaint turns out to be unfounded. So this
 * module suggests, the manager accepts, and incident_training keeps who
 * decided and why.
 *
 * Pure except for the loaders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const INCIDENT_KINDS = [
  { value: "complaint", label: "Complaint" },
  { value: "accident", label: "Accident" },
  { value: "near_miss", label: "Near miss" },
  { value: "safeguarding", label: "Safeguarding concern" },
] as const;

export const INCIDENT_STATUSES = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "closed", label: "Closed" },
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]["value"];

/**
 * What it was about, and what that suggests.
 *
 * Course slugs rather than titles or ids: a title is marketing copy that
 * changes, an id differs per environment, and a slug is the stable thing the
 * catalogue already keys on. A slug that no longer exists simply drops out of
 * the suggestions — a missing course must never break a complaint record.
 */
export const INCIDENT_CATEGORIES = [
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

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]["value"];

export function kindLabel(value: string): string {
  return INCIDENT_KINDS.find((k) => k.value === value)?.label ?? value;
}

export function categoryLabel(value: string): string {
  return INCIDENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function statusLabel(value: string): string {
  return INCIDENT_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export interface IncidentPerson {
  user_id: string;
  name: string | null;
  involvement: string;
}

export interface Incident {
  id: string;
  kind: string;
  category: string;
  occurred_on: string;
  summary: string;
  outcome: string | null;
  status: string;
  closed_on: string | null;
  people: IncidentPerson[];
}

export interface CourseRef {
  id: string;
  slug: string;
  title: string;
}

export interface Suggestion {
  course: CourseRef;
  /** Already assigned off this incident — shown as done, not offered again. */
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
  category: string;
  courses: CourseRef[];
  assigned: Map<string, string | null>;
}): Suggestion[] {
  const wanted =
    INCIDENT_CATEGORIES.find((c) => c.value === category)?.courses ?? [];
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

/**
 * An incident with its people, in one request. The people come embedded, so
 * there is no second `.in("incident_id", …)` read to keep under the URL
 * limit or the 1,000-row cap.
 */
const INCIDENT_SELECT =
  "id, kind, category, occurred_on, summary, outcome, status, closed_on, incident_people (user_id, involvement, person:users!incident_people_user_id_fkey (full_name, email))";

/** Incidents one person is named in, newest first. */
export async function loadIncidentsForPerson(
  supabase: SupabaseClient,
  userId: string,
): Promise<Incident[]> {
  const { data: links } = await supabase
    .from("incident_people")
    .select("incident_id")
    .eq("user_id", userId)
    .limit(200);
  const ids = (links ?? []).map((l) => l.incident_id as string);
  if (ids.length === 0) return [];
  // At most 100 ids to a request: past a few hundred the URL is refused.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const pages = await Promise.all(
    chunks.map((chunk) => supabase.from("incidents").select(INCIDENT_SELECT).in("id", chunk)),
  );
  return pages
    .flatMap((p) => p.data ?? [])
    .map((r) => shapeIncident(r as Record<string, unknown>))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
}

/**
 * Every incident in the organisation, newest first. RLS does the scoping;
 * the organisation filter is there so the (organisation_id, occurred_on)
 * index serves the read.
 */
export async function loadIncidents(
  supabase: SupabaseClient,
  organisationId?: string | null,
): Promise<Incident[]> {
  let q = supabase.from("incidents").select(INCIDENT_SELECT);
  if (organisationId) q = q.eq("organisation_id", organisationId);
  const { data } = await q.order("occurred_on", { ascending: false }).limit(200);
  return (data ?? []).map((r) => shapeIncident(r as Record<string, unknown>));
}

function shapeIncident(row: Record<string, unknown>): Incident {
  const people = ((row.incident_people as Record<string, unknown>[] | null) ?? []).map((p) => {
    const raw = p.person;
    const person = (Array.isArray(raw) ? raw[0] : raw) as
      | { full_name?: string | null; email?: string | null }
      | undefined;
    return {
      user_id: p.user_id as string,
      name: person?.full_name ?? person?.email ?? null,
      involvement: p.involvement as string,
    };
  });
  return {
    id: row.id as string,
    kind: row.kind as string,
    category: row.category as string,
    occurred_on: row.occurred_on as string,
    summary: row.summary as string,
    outcome: (row.outcome as string | null) ?? null,
    status: row.status as string,
    closed_on: (row.closed_on as string | null) ?? null,
    people,
  };
}

/** Courses already assigned off an incident for one person: course_id → reason. */
export async function loadIncidentTraining(
  supabase: SupabaseClient,
  incidentIds: string[],
  userId: string,
): Promise<Map<string, Map<string, string | null>>> {
  const byIncident = new Map<string, Map<string, string | null>>();
  if (incidentIds.length === 0) return byIncident;
  const { data } = await supabase
    .from("incident_training")
    .select("incident_id, course_id, reason")
    .in("incident_id", incidentIds)
    .eq("user_id", userId);
  for (const row of data ?? []) {
    const map = byIncident.get(row.incident_id as string) ?? new Map();
    map.set(row.course_id as string, (row.reason as string | null) ?? null);
    byIncident.set(row.incident_id as string, map);
  }
  return byIncident;
}
