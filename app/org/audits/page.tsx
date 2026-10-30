import Link from "next/link";
import { Plus } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auditKind } from "@/lib/audits";
import { dueCounts } from "@/lib/service-audits";
import { loadServiceDue } from "@/lib/service-audits-due";
import { formatDate } from "@/lib/dates";
import { ReviewChip } from "./review-chip";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });
const CHIP = {
  overdue: "bg-rose-100 text-rose-700",
  never: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  scheduled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
} as const;

/**
 * Service audits (SERVICE-AUDITS.md): what waits for a manager's review,
 * where each audit stands — across the service, and client by client — and
 * the audits carried out.
 */
export default async function AuditsPage() {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [due, { data: audits }, { data: waiting }] = await Promise.all([
    loadServiceDue(supabase, orgId),
    supabase
      .from("audits")
      .select("id, kind, title, subject, client_name, held_on, score, review_status")
      .eq("organisation_id", orgId)
      .order("held_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("audits")
      .select("id, kind, title, client_name, held_on, score")
      .eq("organisation_id", orgId)
      .eq("review_status", "waiting")
      .order("held_on")
      .limit(100),
  ]);
  const titleOf = (a: { title?: unknown; kind?: unknown }) => (a.title as string | null) ?? auditKind(a.kind as string)?.label ?? (a.kind as string);
  const service = due.filter((d) => d.form.scope === "service");
  const byClient = due.filter((d) => d.form.scope === "client");

  return (
    <DashboardShell title="Audits" context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Audits of the service and of each client. Anything answered No can be given an owner and a date, and goes into their
            task list.
          </p>
          <Link href="/org/audits/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" /> Carry out an audit
          </Link>
        </div>

        {(waiting ?? []).length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Waiting for a manager&apos;s review</h3>
            <Card className="border-amber-300">
              <CardContent className="divide-y p-0">
                {(waiting ?? []).map((a) => (
                  <Link key={a.id as string} href={`/org/audits/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                    <span>
                      {titleOf(a)}
                      {a.client_name && <span className="ml-2 text-xs text-muted-foreground">{a.client_name as string}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(a.held_on as string)} · {a.score as number}%
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {byClient.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Client by client</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {byClient.map((d) => {
                const c = dueCounts(d.clients);
                return (
                  <Card key={d.form.key}>
                    <CardContent className="space-y-1 pt-6">
                      <p className="font-medium">{d.form.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.total} client{c.total === 1 ? "" : "s"}
                        {d.form.medicationOnly ? " helped with medicines" : ""}
                      </p>
                      <p className="text-xs">
                        <span className={c.late ? "font-medium text-rose-700" : "text-muted-foreground"}>{c.late} due now</span>
                        <span className="text-muted-foreground"> · {c.soon} in the next 30 days</span>
                      </p>
                      <div className="flex gap-3 pt-1 text-xs">
                        <Link href={`/org/due/audits?form=${d.form.key}`} className="text-primary hover:underline">
                          Who&apos;s due →
                        </Link>
                        <Link href={`/org/audits/new?form=${d.form.key}`} className="text-primary hover:underline">
                          Carry one out →
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Across the service</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {service.map((d) => (
              <Card key={d.form.key}>
                <CardContent className="space-y-1 pt-6">
                  <p className="font-medium">{d.form.label}</p>
                  <p className="text-xs text-muted-foreground">{d.last ? `Last ${fmt(d.last)}` : "Never carried out"}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[d.status]}`}>
                    {d.status === "never" ? "Due now" : d.next ? `Next ${fmt(d.next)}` : "No date set"}
                  </span>
                  <div>
                    <Link href={`/org/audits/new?form=${d.form.key}`} className="text-xs text-primary hover:underline">
                      Carry one out →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Audits carried out</h3>
          {(audits ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">None yet.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {(audits ?? []).map((a) => (
                  <Link key={a.id as string} href={`/org/audits/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                    <span className="flex flex-wrap items-center gap-2">
                      {titleOf(a)}
                      {(a.client_name || a.subject) && (
                        <span className="text-xs text-muted-foreground">{(a.client_name ?? a.subject) as string}</span>
                      )}
                      <ReviewChip status={a.review_status as string} />
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
        </section>
      </div>
    </DashboardShell>
  );
}
