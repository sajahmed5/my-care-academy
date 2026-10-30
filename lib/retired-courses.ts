import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retired courses (Saj, 30 Oct 2026) are offered nowhere. The pickers leave
 * them out with `.is("retired_at", null)`; this is the check on the way in,
 * because a page opened before the course was retired, or a call from
 * MyRoster, can still name one. A course id that doesn't exist is dropped too.
 */
export async function withoutRetired(client: SupabaseClient, courseIds: string[]): Promise<string[]> {
  const ids = [...new Set(courseIds)];
  const live: string[] = [];
  // A hundred at a time: the ids travel in the URL.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await client.from("courses").select("id").in("id", ids.slice(i, i + 100)).is("retired_at", null);
    if (error) throw new Error(error.message);
    live.push(...(data ?? []).map((c) => c.id as string));
  }
  return live;
}

/** The message when everything asked for was retired. */
export const RETIRED_COURSE = "That course has been retired and can't be assigned any more.";
