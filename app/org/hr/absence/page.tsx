import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { loadCurrentCarers } from "@/app/org/due/load";
import { absenceDue, daysOff, needsFitNote, sanitiseTriggers, type Absence } from "@/lib/hr/absence";
import { AbsenceForm } from "./absence-forms";
import { addDays } from "@/lib/hr/probation";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Sickness absence across the company (HR-PACK.md): who's off now, the
 * return-to-work interviews due (they show in Who's due), welfare meetings
 * for long-term absence, and who has reached a trigger point. Reaching one
 * flags it; the manager decides what happens.
 */
export default async function AbsenceOverviewPage() {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = addDays(today, -400);
  const [people, absences, meetings, { data: settings }] = await Promise.all([
    loadCurrentCarers(supabase, orgId, { withOffice: true }),
    fetchAll((f, t) =>
      supabase
        .from("sickness_absences")
        .select("id, user_id, start_date, returned_on, reason, certification, fit_note_until, excluded_from_triggers, rtw_status")
        .eq("organisation_id", orgId)
        .or(`start_date.gte.${yearAgo},returned_on.is.null,rtw_status.eq.none`)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) => supabase.from("absence_welfare_meetings").select("absence_id, held_on").eq("organisation_id", orgId).order("absence_id").range(f, t)),
    supabase.from("hr_settings").select("bradford_triggers").eq("organisation_id", orgId).maybeSingle(),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const due = absenceDue(absences as unknown as Absence[], meetings as never, sanitiseTriggers(settings?.bradford_triggers), today, new Set(names.keys()));
  const name = (id: string) => names.get(id) ?? "Someone who has left";

  const list = (title: string, rows: React.ReactNode[], empty?: string) => (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
      ) : (
        <Card>
          <CardContent className="divide-y p-0">{rows}</CardContent>
        </Card>
      )}
    </section>
  );
  const row = (key: string, href: string, who: string, detail: React.ReactNode) => (
    <Link key={key} href={href} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50">
      <span className="font-medium text-primary">{who}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{detail}</span>
    </Link>
  );

  return (
    <DashboardShell title="Absence" context={context}>
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="font-semibold">Record an absence</h3>
            <AbsenceForm people={people} />
          </CardContent>
        </Card>

        {list(
          "Off sick now",
          due.off.map((a) =>
            row(a.id, `/org/hr/absence/${a.id}`, name(a.user_id), (
              <>
                <span>{a.reason} · since {fmt(a.start_date)} · {daysOff(a, today)} days</span>
                {needsFitNote(a, today) && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Fit note needed</span>}
              </>
            )),
          ),
          "Nobody is off sick.",
        )}

        {list(
          "Return-to-work interviews due",
          due.rtw.map((a) =>
            row(a.id, `/org/hr/absence/${a.id}`, name(a.user_id), (
              <>
                <span>Back {fmt(a.returned_on!)} after {a.reason.toLowerCase()}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${a.late ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                  {a.late ? "Overdue" : "Due"} {fmt(a.dueOn)}
                </span>
              </>
            )),
          ),
          "None due.",
        )}

        {due.welfare.length > 0 &&
          list(
            "Welfare meetings due (off over 4 weeks)",
            due.welfare.map((a) =>
              row(a.id, `/org/hr/absence/${a.id}`, name(a.user_id), (
                <span className={`rounded-full px-2 py-0.5 font-medium ${a.dueOn < today ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                  Due {fmt(a.dueOn)}
                </span>
              )),
            ),
          )}

        {list(
          "Reached a trigger point",
          due.triggers.map((b) =>
            row(b.userId, `/org/staff/${b.userId}?section=employment&sub=absence`, name(b.userId), (
              <>
                <span>
                  Bradford score {b.score} ({b.spells} spell{b.spells === 1 ? "" : "s"}, {b.days} day{b.days === 1 ? "" : "s"} in 52 weeks)
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">Over {b.reached}</span>
              </>
            )),
          ),
          "Nobody has reached a trigger point. Nothing happens on its own when someone does: you decide.",
        )}
      </div>
    </DashboardShell>
  );
}
