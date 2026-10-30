import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DUE_GROUP_LABEL } from "@/lib/due-view";
import { dueCounts } from "@/lib/service-audits";
import { loadServiceDue } from "@/lib/service-audits-due";
import { formatDate } from "@/lib/dates";
import { ClientDueList } from "./client-due-list";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Which audits are due (SERVICE-AUDITS.md): each audit of the whole service,
 * then client by client for the ones done per client — `?form=<key>` picks
 * which one's clients are listed.
 */
export default async function AuditsDuePage({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { form: key } = await searchParams;
  const supabase = await createClient();
  const due = await loadServiceDue(supabase, context.organisationId!);
  const service = due.filter((d) => d.form.scope === "service");
  const byClient = due.filter((d) => d.form.scope === "client");
  const open = byClient.find((d) => d.form.key === key) ?? byClient[0];

  return (
    <DashboardShell title="Audits due" context={context}>
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Across the service</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {service.map((d) => (
                <Link
                  key={d.form.key}
                  href={`/org/audits/new?form=${d.form.key}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{d.form.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.last ? `Last ${fmt(d.last)} · ` : ""}
                    {d.status === "never" ? "Never carried out — due now" : d.next ? `${DUE_GROUP_LABEL[d.status]} · next ${fmt(d.next)}` : "No date set"}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>

        {open && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Client by client</h3>
            <div className="flex flex-wrap gap-2">
              {byClient.map((d) => {
                const c = dueCounts(d.clients);
                const on = d.form.key === open.form.key;
                return (
                  <Link
                    key={d.form.key}
                    href={`/org/due/audits?form=${d.form.key}`}
                    aria-current={on ? "page" : undefined}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}
                  >
                    {d.form.label}
                    {c.late ? ` · ${c.late} due` : ""}
                  </Link>
                );
              })}
            </div>
            <ClientDueList rows={open.clients} noun="one" href={(id) => `/org/audits/new?form=${open.form.key}&client=${id}`} />
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
