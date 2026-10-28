import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { buildDueRows } from "@/lib/due-view";
import { DueList } from "../due-list";
import { loadCurrentCarers } from "../load";

/**
 * Who is due a spot check, across the organisation (ROADMAP §3). Each area
 * falls due on its own; a carer's date is the soonest of them, as on the file.
 */
export default async function SpotChecksDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "people.competency");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [people, records] = await Promise.all([
    loadCurrentCarers(supabase, orgId),
    fetchAll((f, t) =>
      supabase
        .from("competency_checks")
        .select("id, user_id, area, checked_on, next_due")
        .eq("organisation_id", orgId)
        .order("id")
        .range(f, t),
    ),
  ]);
  const rows = buildDueRows(
    people,
    records.map((r) => ({
      userId: r.user_id as string,
      heldOn: r.checked_on as string,
      nextDue: (r.next_due as string | null) ?? null,
      area: r.area as string,
    })),
    new Date(),
  );
  return (
    <DashboardShell title="Spot checks due" context={context}>
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Every current carer and when their next spot check falls — the soonest across the areas they are checked in.
        </p>
        <DueList rows={rows} section="competency" noun="check" />
      </div>
    </DashboardShell>
  );
}
