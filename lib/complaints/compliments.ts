/**
 * Compliments (COMPLAINTS-SAFEGUARDING.md, agreed 29 Oct 2026): logged
 * beside the concerns, linked to the staff they are about and the client
 * they came from. They show on the carer's file and the client's page, and
 * Staff Audits reads them into an appraisal.
 *
 * Read through the request's client: RLS keeps them to console users of the
 * organisation, with complaints in their package.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Compliment {
  id: string;
  receivedOn: string;
  fromName: string | null;
  fromRole: string | null;
  whatWasSaid: string;
  client: { id: string; name: string } | null;
  people: { userId: string; name: string | null }[];
}

const SELECT =
  "id, received_on, from_name, from_role, what_was_said, client:clients (id, full_name), compliment_people (user_id, person:users!compliment_people_user_id_fkey (full_name, email))";

function shape(r: Record<string, unknown>): Compliment {
  const c = (Array.isArray(r.client) ? r.client[0] : r.client) as { id: string; full_name: string } | null;
  return {
    id: r.id as string,
    receivedOn: r.received_on as string,
    fromName: (r.from_name as string | null) ?? null,
    fromRole: (r.from_role as string | null) ?? null,
    whatWasSaid: r.what_was_said as string,
    client: c ? { id: c.id, name: c.full_name } : null,
    people: ((r.compliment_people as Record<string, unknown>[] | null) ?? []).map((p) => {
      const u = (Array.isArray(p.person) ? p.person[0] : p.person) as { full_name?: string | null; email?: string | null } | null;
      return { userId: p.user_id as string, name: u?.full_name ?? u?.email ?? null };
    }),
  };
}

/** Every compliment in the organisation, newest first. */
export async function loadCompliments(supabase: SupabaseClient, organisationId: string): Promise<Compliment[]> {
  const { data } = await supabase
    .from("compliments")
    .select(SELECT)
    .eq("organisation_id", organisationId)
    .order("received_on", { ascending: false })
    .limit(500);
  return (data ?? []).map((r) => shape(r as Record<string, unknown>));
}

/** The compliments about one member of staff. */
export async function loadComplimentsForPerson(supabase: SupabaseClient, userId: string): Promise<Compliment[]> {
  // The same people embedded twice: once, inner-joined, to pick this
  // person's compliments; once in full, to say who else each was about.
  const { data } = await supabase
    .from("compliments")
    .select(`mine:compliment_people!inner (user_id), ${SELECT}`)
    .eq("mine.user_id", userId)
    .order("received_on", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => shape(r as unknown as Record<string, unknown>));
}

/** The compliments from or about one client. */
export async function loadComplimentsForClient(supabase: SupabaseClient, clientId: string): Promise<Compliment[]> {
  const { data } = await supabase
    .from("compliments")
    .select(SELECT)
    .eq("client_id", clientId)
    .order("received_on", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => shape(r as Record<string, unknown>));
}
