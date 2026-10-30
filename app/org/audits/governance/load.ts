import type { UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { loadGovernanceReport } from "@/lib/governance-data";
import type { MonthRange } from "@/lib/governance";

/** The report for one month, with each part the company's package has. */
export async function governanceFor(context: UserContext, range: MonthRange) {
  const [supabase, enabled] = await Promise.all([createClient(), enabledMap(context)]);
  return loadGovernanceReport(supabase, context.organisationId!, range, {
    complaints: !!enabled["complaints.register"],
    supervisions: !!enabled["people.supervisions"],
    spotChecks: !!enabled["people.competency"],
  });
}
