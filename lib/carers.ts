import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How many carers an organisation is charged for on Training only
 * (lib/pricing.ts): everyone with a learner account who has not left.
 * Managers and office workers train too, but are not charged for (Saj,
 * 9 Nov 2026), and neither is a deactivated carer — a leaver stops counting
 * from the next bill.
 */
export async function countCarers(supabase: SupabaseClient, organisationId: string): Promise<number> {
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("role", "learner")
    .neq("status", "deactivated");
  return count ?? 0;
}
