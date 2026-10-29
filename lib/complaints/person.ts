/**
 * The concerns one member of staff is named in, for their file and their
 * evidence pack, and the training assigned off each.
 *
 * Read through the request's client, so RLS decides: a console user sees their
 * own organisation's, and a carer — who has no policy on complaints — sees
 * none, including the ones naming them (COMPLAINTS-SAFEGUARDING.md, Who sees it).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonConcern {
  id: string;
  reference: string;
  kind: string;
  category: string | null;
  /** When it happened, or when it reached us if that is all we know. */
  occurredOn: string;
  description: string;
  outcome: string | null;
  status: string;
  closedOn: string | null;
  involvement: string;
  /** Everyone named on it, this person included. */
  people: { user_id: string; name: string | null }[];
}

const nameOf = (raw: unknown): string | null => {
  const p = (Array.isArray(raw) ? raw[0] : raw) as { full_name?: string | null; email?: string | null } | undefined;
  return p?.full_name ?? p?.email ?? null;
};

/**
 * Newest first. One request: the record comes embedded in each of this
 * person's complaint_people rows, and the record's own people inside that, so
 * there is no `.in(…)` read to keep under the URL limit.
 */
export async function loadConcernsForPerson(supabase: SupabaseClient, userId: string): Promise<PersonConcern[]> {
  const { data } = await supabase
    .from("complaint_people")
    .select(
      "involvement, complaint:complaints!inner (id, reference, kind, category, occurred_on, reported_on, description, outcome_summary, status, closed_on, complaint_people (user_id, person:users!complaint_people_user_id_fkey (full_name, email)))",
    )
    .eq("user_id", userId)
    .limit(500);
  return (data ?? [])
    .map((row) => {
      const c = (Array.isArray(row.complaint) ? row.complaint[0] : row.complaint) as Record<string, unknown> | null;
      if (!c) return null;
      const people = ((c.complaint_people as Record<string, unknown>[] | null) ?? []).map((p) => ({
        user_id: p.user_id as string,
        name: nameOf(p.person),
      }));
      return {
        id: c.id as string,
        reference: c.reference as string,
        kind: c.kind as string,
        category: (c.category as string | null) ?? null,
        occurredOn: ((c.occurred_on as string | null) ?? (c.reported_on as string)) as string,
        description: c.description as string,
        outcome: (c.outcome_summary as string | null) ?? null,
        status: c.status as string,
        closedOn: (c.closed_on as string | null) ?? null,
        involvement: row.involvement as string,
        people,
      } satisfies PersonConcern;
    })
    .filter((c): c is PersonConcern => !!c)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
}

/** Courses already assigned off each concern for one person: concern → course → reason. */
export async function loadConcernTraining(
  supabase: SupabaseClient,
  complaintIds: string[],
  userId?: string,
): Promise<Map<string, Map<string, string | null>>> {
  const out = new Map<string, Map<string, string | null>>();
  if (complaintIds.length === 0) return out;
  // At most 100 ids to a request: past a few hundred the URL is refused.
  for (let i = 0; i < complaintIds.length; i += 100) {
    let q = supabase
      .from("complaint_training")
      .select("complaint_id, user_id, course_id, reason")
      .in("complaint_id", complaintIds.slice(i, i + 100));
    if (userId) q = q.eq("user_id", userId);
    const { data } = await q;
    for (const row of data ?? []) {
      // Keyed by person too when it is one record's training for everyone on it.
      const key = userId ? (row.complaint_id as string) : `${row.complaint_id}:${row.user_id}`;
      const map = out.get(key) ?? new Map<string, string | null>();
      map.set(row.course_id as string, (row.reason as string | null) ?? null);
      out.set(key, map);
    }
  }
  return out;
}
