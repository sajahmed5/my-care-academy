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
import { runHref } from "@/lib/client-qa";
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

interface Done {
  href: string;
  title: string;
  about: string | null;
  heldOn: string;
  createdAt: string;
  score: number | null;
  review: string;
}

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
  const [due, { data: audits }, { data: qas }] = await Promise.all([
    loadServiceDue(supabase, orgId),
    supabase
      .from("audits")
      .select("id, kind, title, subject, client_name, held_on, created_at, score, review_status")
      .eq("organisation_id", orgId)
      .order("held_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("client_qas")
      .select("id, client_name, held_on, created_at, completed, score, review_status")
      .eq("organisation_id", orgId)
      .order("held_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  // Audits and QAs side by side, newest first: both are how the service checks itself.
  const done: Done[] = [
    ...(audits ?? []).map((a) => ({
      href: `/org/audits/${a.id}`,
      title: (a.title as string | null) ?? auditKind(a.kind as string)?.label ?? (a.kind as string),
      about: ((a.client_name ?? a.subject) as string | null) ?? null,
      heldOn: a.held_on as string,
      createdAt: a.created_at as string,
      score: a.score as number | null,
      review: a.review_status as string,
    })),
    ...(qas ?? []).map((q) => ({
      href: `/org/audits/qa/${q.id}`,
      title: q.completed ? "Client QA" : "Client QA — attempted",
      about: q.client_name as string,
      heldOn: q.held_on as string,
      createdAt: q.created_at as string,
      score: q.score as number | null,
      review: q.review_status as string,
    })),
  ].sort((a, b) => b.heldOn.localeCompare(a.heldOn) || b.createdAt.localeCompare(a.createdAt));
  const waiting = done.filter((d) => d.review === "waiting").reverse();
  const service = due.filter((d) => d.form.scope === "service");
  const byClient = due.filter((d) => d.form.scope === "client");

  return (
    <DashboardShell title="Audits" context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Audits of the service and of each client, and client QAs. Anything answered No can be given an owner and a date, and goes into their
            task list.
          </p>
          <Link href="/org/audits/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" /> Carry out an audit
          </Link>
        </div>

        {waiting.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Waiting for a manager&apos;s review</h3>
            <Card className="border-amber-300">
              <CardContent className="divide-y p-0">
                {waiting.map((a) => (
                  <Link key={a.href} href={a.href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                    <span>
                      {a.title}
                      {a.about && <span className="ml-2 text-xs text-muted-foreground">{a.about}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(a.heldOn)} · {a.score}%
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
                        <Link href={runHref(d.form.key)} className="text-primary hover:underline">
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
          <h3 className="text-sm font-semibold">Audits and QAs carried out</h3>
          {done.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">None yet.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {done.map((a) => (
                  <Link key={a.href} href={a.href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                    <span className="flex flex-wrap items-center gap-2">
                      {a.title}
                      {a.about && <span className="text-xs text-muted-foreground">{a.about}</span>}
                      <ReviewChip status={a.review} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(a.heldOn)}
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
