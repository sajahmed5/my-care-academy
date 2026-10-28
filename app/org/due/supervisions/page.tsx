import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { buildDueRows } from "@/lib/due-view";
import { DueList } from "../due-list";
import { loadCurrentCarers } from "../load";

/** Who is due a supervision, across the organisation (ROADMAP §3). */
export default async function SupervisionsDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "people.supervisions");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [people, records] = await Promise.all([
    loadCurrentCarers(supabase, orgId),
    fetchAll((f, t) =>
      supabase
        .from("supervisions")
        .select("id, user_id, held_on, next_due")
        .eq("organisation_id", orgId)
        .order("id")
        .range(f, t),
    ),
  ]);
  const rows = buildDueRows(
    people,
    records.map((r) => ({ userId: r.user_id as string, heldOn: r.held_on as string, nextDue: (r.next_due as string | null) ?? null })),
    new Date(),
  );
  return (
    <DashboardShell title="Supervisions due" context={context}>
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Every current carer and when their next supervision falls. Open someone to record one.
        </p>
        <DueList rows={rows} section="supervisions" noun="supervision" />
      </div>
    </DashboardShell>
  );
}
