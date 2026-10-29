import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { AUDIT_KINDS, auditKind } from "@/lib/audits";
import { dueStatus } from "@/lib/records";
import { formatDate } from "@/lib/dates";
import { RunAudit } from "./run-audit";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });
const CHIP = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  scheduled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
} as const;

/**
 * Audits (ROADMAP §4): where each kind stands — last done, next due — the
 * audits carried out, and the checklist to run the next one.
 */
export default async function AuditsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { run } = await searchParams;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [{ data: audits }, { data: staff }] = await Promise.all([
    supabase
      .from("audits")
      .select("id, kind, subject, held_on, score, next_due")
      .eq("organisation_id", orgId)
      .order("held_on", { ascending: false })
      .limit(300),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", ["org_admin", "org_office", "learner"])
      .order("full_name")
      .limit(1000),
  ]);
  const now = new Date();
  const latest = new Map<string, { held_on: string; next_due: string | null; score: number | null }>();
  for (const a of audits ?? []) if (!latest.has(a.kind as string)) latest.set(a.kind as string, a as never);

  return (
    <DashboardShell title="Audits" context={context}>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {AUDIT_KINDS.map((k) => {
            const last = latest.get(k.key);
            const status = last ? dueStatus(last.next_due, now) : "overdue";
            return (
              <Card key={k.key}>
                <CardContent className="space-y-1 pt-6">
                  <p className="font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {last ? `Last ${fmt(last.held_on)}${last.score !== null ? ` · ${last.score}%` : ""}` : "Never carried out"}
                  </p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[status]}`}>
                    {!last ? "Due now" : last.next_due ? `Next ${fmt(last.next_due)}` : "No date set"}
                  </span>
                  <div>
                    <Link href={`/org/audits?run=${k.key}#run`} className="text-xs text-primary hover:underline">
                      Run one →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div id="run" className="scroll-mt-24 space-y-2">
          <h3 className="text-sm font-semibold">Run an audit</h3>
          <p className="text-xs text-muted-foreground">
            These checklists are a starting point; read them against your own policies. Anything answered No can be given
            an owner and a date, and goes into their task list.
          </p>
          <RunAudit
            key={run ?? "default"}
            initialKind={auditKind(run ?? "")?.key}
            staff={(staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }))}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Audits carried out</h3>
          {(audits ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">None yet.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {(audits ?? []).map((a) => (
                  <Link
                    key={a.id as string}
                    href={`/org/audits/${a.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span>
                      {auditKind(a.kind as string)?.label ?? (a.kind as string)}
                      {a.subject && <span className="ml-2 text-xs text-muted-foreground">{a.subject as string}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(a.held_on as string)}
                      {a.score !== null ? ` · ${a.score}%` : ""}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
