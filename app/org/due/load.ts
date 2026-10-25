import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import type { DuePerson } from "@/lib/due-view";

/** The organisation's current carers: active learners, by name. Paged past 1,000. */
export async function loadCurrentCarers(supabase: SupabaseClient, organisationId: string): Promise<DuePerson[]> {
  const rows = await fetchAll((f, t) =>
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", organisationId)
      .eq("role", "learner")
      .eq("status", "active")
      .order("id")
      .range(f, t),
  );
  return rows
    .map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) || "Unnamed" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
