import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { STAFF_ROLES } from "@/lib/roles";
import { CHECKLIST, checklistDone, reasonLabel, sanitiseChecklist } from "@/lib/hr/leavers";
import { LeaverForm } from "./leaver-forms";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Leavers (HR-PACK.md): who's leaving and who has left, with their checklist
 * still to finish; and recording someone's leaving.
 */
export default async function LeaversPage() {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [leavers, people] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("hr_leavers")
        .select("id, user_id, reason, last_day, checklist, login_off_at, exit_status, person:users!hr_leavers_user_id_fkey(full_name, email)")
        .eq("organisation_id", orgId)
        .order("last_day", { ascending: false })
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) => supabase.from("users").select("id, full_name, email").eq("organisation_id", orgId).in("role", STAFF_ROLES).eq("status", "active").order("id").range(f, t)),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const leaving = new Set(leavers.map((l) => l.user_id as string));
  const choose = people
    .filter((p) => !leaving.has(p.id as string) && p.id !== context.userId)
    .map((p) => ({ id: p.id as string, name: ((p.full_name as string | null) || (p.email as string)) ?? "Unnamed" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const name = (l: Record<string, unknown>) => {
    const p = (Array.isArray(l.person) ? l.person[0] : l.person) as { full_name: string | null; email: string | null } | null;
    return p?.full_name || p?.email || "Someone";
  };
  const row = (l: Record<string, unknown>) => {
    const done = checklistDone(sanitiseChecklist(l.checklist));
    return (
      <Link key={l.id as string} href={`/org/hr/leavers/${l.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50">
        <span>
          <span className="font-medium text-primary">{name(l)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{reasonLabel(l.reason as string)} · last day {fmt(l.last_day as string)}</span>
        </span>
        <span className="flex flex-wrap gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${done === CHECKLIST.length ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            Checklist {done} of {CHECKLIST.length}
          </span>
          {l.login_off_at ? <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Login off</span> : null}
          {l.exit_status === "done" ? <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Exit interview done</span> : null}
        </span>
      </Link>
    );
  };
  const soon = leavers.filter((l) => (l.last_day as string) >= today);
  const gone = leavers.filter((l) => (l.last_day as string) < today);

  return (
    <DashboardShell title="Leavers" context={context}>
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="font-semibold">Record someone&apos;s leaving</h3>
            <LeaverForm people={choose} />
          </CardContent>
        </Card>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Leaving ({soon.length})</h3>
          {soon.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is working their notice.</p> : <Card><CardContent className="divide-y p-0">{soon.map(row)}</CardContent></Card>}
        </section>
        {gone.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Left ({gone.length})</h3>
            <Card><CardContent className="divide-y p-0">{gone.map(row)}</CardContent></Card>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
