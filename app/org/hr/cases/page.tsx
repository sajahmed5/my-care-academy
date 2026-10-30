import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { activeWarning, caseSettingsFromRow, kindLabel, nextDeadline, outcomeLabel, stageLabel, type HrCase } from "@/lib/hr/cases";
import { hasCaseAccess } from "@/lib/hr/case-access";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Disciplinary and grievance cases (HR-PACK.md): open ones with their next
 * deadline first, then closed. Read under RLS, so each person sees only the
 * cases they may (managers and named office workers; never a case about
 * themselves).
 */
export default async function CasesPage() {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  if (!(await hasCaseAccess(admin, context))) {
    return (
      <DashboardShell title="Cases" context={context}>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Disciplinary and grievance cases are for managers. A manager can give you access under Settings → HR → Disciplinary and grievance.
        </p>
      </DashboardShell>
    );
  }
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [cases, { data: settings }] = await Promise.all([
    fetchAll((f, t) =>
      supabase.from("hr_cases").select("*, person:users!hr_cases_user_id_fkey(full_name, email)").eq("organisation_id", orgId).order("raised_on", { ascending: false }).range(f, t),
    ),
    supabase.from("hr_settings").select("*").eq("organisation_id", orgId).maybeSingle(),
  ]);
  const s = caseSettingsFromRow(settings);
  const today = new Date().toISOString().slice(0, 10);
  const all = cases as unknown as Array<HrCase & { ref: string; person: { full_name: string | null; email: string | null } | null }>;
  const open = all.filter((c) => !c.closed_on).map((c) => ({ c, next: nextDeadline(c, s) })).sort((a, b) => (a.next?.on ?? "9999").localeCompare(b.next?.on ?? "9999"));
  const closed = all.filter((c) => c.closed_on);
  const who = (c: (typeof all)[number]) => c.person?.full_name || c.person?.email || "Someone";

  return (
    <DashboardShell title="Disciplinary and grievance" context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Following the ACAS Code of Practice: each step, its letters and deadlines, minutes signed as accurate, and the whole file as one PDF.
          </p>
          <Link href="/org/hr/cases/new" className={buttonVariants()}>Open a case</Link>
        </div>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Open ({open.length})</h3>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open cases.</p>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {open.map(({ c, next }) => (
                  <Link key={c.id} href={`/org/hr/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50">
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{c.ref}</span>{" "}
                      <span className="font-medium text-primary">{who(c)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{kindLabel(c.kind, c.subtype)} · {stageLabel(c.kind, c.stage)}</span>
                    </span>
                    {next && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${next.on < today ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                        {next.what}: {fmt(next.on)}
                      </span>
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
        {closed.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Closed ({closed.length})</h3>
            <Card>
              <CardContent className="divide-y p-0">
                {closed.map((c) => (
                  <Link key={c.id} href={`/org/hr/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50">
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{c.ref}</span> <span className="font-medium">{who(c)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{kindLabel(c.kind, c.subtype)} · {c.outcome ? outcomeLabel(c.outcome) : "no outcome"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {activeWarning(c, today) ? <span className="mr-2 rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">Warning active</span> : null}
                      Closed {fmt(c.closed_on!)}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
