import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { DueTabs } from "../due-tabs";
import { buildDueRows } from "@/lib/due-view";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { DueList } from "../due-list";
import { loadCurrentCarers } from "../load";

/**
 * Who is due a competency assessment. Each skill falls due on its own, so the
 * list is per skill (`?area=`), or — for every skill — each carer's soonest,
 * as on their file.
 */
export default async function CompetencyDuePage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "people.competency");
  const { area: areaParam } = await searchParams;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  // The company's own skills, as it has them (STAFF-AUDITS.md, Editable).
  const areas = (await loadAuditForms(orgId)).competency.map((f) => ({ value: f.key, label: f.label }));
  const area = areas.some((a) => a.value === areaParam) ? areaParam! : null;
  const [people, records] = await Promise.all([
    loadCurrentCarers(supabase, orgId),
    fetchAll((f, t) => {
      let q = supabase.from("competency_checks").select("id, user_id, area, checked_on, next_due").eq("organisation_id", orgId);
      if (area) q = q.eq("area", area);
      return q.order("id").range(f, t);
    }),
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
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background hover:bg-muted"}`;
  return (
    <DashboardShell title="Who's due" context={context}>
      <div className="space-y-4">
        <DueTabs context={context} active="/org/due/competency" />
        <p className="text-sm text-muted-foreground">
          Every current carer and when their next competency assessment falls. Pick a skill to see just that one.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/org/due/competency" className={chip(!area)}>
            Every skill
          </Link>
          {areas.map((a) => (
            <Link key={a.value} href={`/org/due/competency?area=${a.value}`} className={chip(area === a.value)}>
              {a.label}
            </Link>
          ))}
        </div>
        <DueList rows={rows} section="competency" noun="assessment" />
      </div>
    </DashboardShell>
  );
}
