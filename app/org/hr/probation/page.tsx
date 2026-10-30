import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { loadCurrentCarers } from "@/app/org/due/load";
import { probationDue, type ProbationDueRow } from "@/lib/hr/probation-due";
import { probationFromRow } from "@/lib/hr/probation";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

const GROUPS: Array<{ key: ProbationDueRow["group"]; title: string; chip: string }> = [
  { key: "overdue", title: "Overdue", chip: "bg-rose-100 text-rose-700" },
  { key: "due_soon", title: "Due in the next 14 days", chip: "bg-amber-100 text-amber-700" },
  { key: "booked", title: "Booked", chip: "bg-teal-50 text-teal-800" },
  { key: "later", title: "Due later", chip: "bg-muted text-muted-foreground" },
  { key: "no_start", title: "No start date on their file", chip: "bg-muted text-muted-foreground" },
];

/**
 * Who's due a probation review (HR-PACK.md: reviews show in Who's due). Every
 * current member of staff still in probation, by their next review; and
 * anyone without a start date, so the list can be trusted.
 */
export default async function ProbationDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [people, emps, reviews, { data: settings }] = await Promise.all([
    loadCurrentCarers(supabase, orgId, { withOffice: true }),
    fetchAll((f, t) => supabase.from("staff_employment").select("user_id, start_date, probation_status, probation_ends_on").eq("organisation_id", orgId).order("user_id").range(f, t)),
    fetchAll((f, t) =>
      supabase.from("probation_reviews").select("id, user_id, due_on, status, booked_on, booked_time, held_on, outcome, is_final").eq("organisation_id", orgId).order("id").range(f, t),
    ),
    supabase.from("hr_settings").select("probation_months, probation_review_months").eq("organisation_id", orgId).maybeSingle(),
  ]);
  const rows = probationDue(people, emps as never, reviews as never, probationFromRow(settings), new Date().toISOString().slice(0, 10));

  return (
    <DashboardShell title="Probation reviews" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Everyone still in probation, by their next review. Open someone to book it (they&apos;re emailed the date) or hold it.
        </p>
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">Nobody is in probation.</CardContent>
          </Card>
        )}
        {GROUPS.map((g) => {
          const group = rows.filter((r) => r.group === g.key);
          if (!group.length) return null;
          return (
            <section key={g.key} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {g.title} ({group.length})
              </h3>
              <Card>
                <CardContent className="divide-y p-0">
                  {group.map((r) => (
                    <Link
                      key={r.person.id}
                      href={`/org/staff/${r.person.id}?section=employment`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium text-primary">{r.person.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {r.next && <span>{r.next.label}</span>}
                        {r.next && (
                          <span className={`rounded-full px-2 py-0.5 font-medium ${g.chip}`}>
                            {r.group === "booked" && r.next.review?.booked_on ? `Booked ${fmt(r.next.review.booked_on)}` : `Due ${fmt(r.next.dueOn)}`}
                          </span>
                        )}
                        {r.group === "no_start" && <span>Set it on their Employment page</span>}
                        <ChevronRight className="size-4" aria-hidden />
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
