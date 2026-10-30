import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { DueTabs } from "../due-tabs";
import { buildDueRows } from "@/lib/due-view";
import { DueList } from "../due-list";
import { loadCurrentCarers } from "../load";

/**
 * Who is due a spot check, across the organisation (ROADMAP §3). Carers only,
 * and never booked: spot checks stay unannounced (STAFF-AUDITS.md).
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
        .from("spot_checks")
        .select("id, user_id, checked_on, next_due")
        .eq("organisation_id", orgId)
        .order("id")
        .range(f, t),
    ),
  ]);
  const rows = buildDueRows(
    people,
    records.map((r) => ({ userId: r.user_id as string, heldOn: r.checked_on as string, nextDue: (r.next_due as string | null) ?? null })),
    new Date(),
  );
  return (
    <DashboardShell title="Who's due" context={context}>
      <div className="space-y-4">
        <DueTabs context={context} active="/org/due/spot-checks" />
        <p className="text-sm text-muted-foreground">
          Every current carer and when their next spot check falls. They are unannounced, so nobody is told the date.
        </p>
        <DueList rows={rows} section="competency" noun="spot check" />
      </div>
    </DashboardShell>
  );
}
