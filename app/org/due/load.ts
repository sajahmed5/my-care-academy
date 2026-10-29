import { STAFF_ROLES } from "@/lib/roles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import type { DuePerson } from "@/lib/due-view";

/**
 * The organisation's current people, by name. Paged past 1,000. Spot checks
 * are for carers only (they happen in clients' homes); supervisions and
 * appraisals are for office staff too (STAFF-AUDITS.md, 29 Oct 2026).
 */
export async function loadCurrentCarers(
  supabase: SupabaseClient,
  organisationId: string,
  { withOffice = false }: { withOffice?: boolean } = {},
): Promise<DuePerson[]> {
  const rows = await fetchAll((f, t) =>
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", organisationId)
      .in("role", withOffice ? STAFF_ROLES : ["learner"])
      .eq("status", "active")
      .order("id")
      .range(f, t),
  );
  return rows
    .map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) || "Unnamed" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
