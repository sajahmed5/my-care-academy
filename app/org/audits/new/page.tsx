import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { STAFF_ROLES } from "@/lib/roles";
import { clientsFor, serviceForm } from "@/lib/service-audits";
import { loadDueClients, loadReviewBelow, loadServiceForms } from "@/lib/service-audits-data";
import { intervalLabel } from "@/lib/audit-forms";
import { RunServiceAudit } from "./run-service-audit";

/**
 * Carry out an audit: `?form=<key>`, and `&client=<id>` from a client's page
 * or the due list. With no form chosen, the list of audits to pick from.
 */
export default async function NewAuditPage({ searchParams }: { searchParams: Promise<{ form?: string; client?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { form: key = "", client } = await searchParams;
  const orgId = context.organisationId!;
  const forms = await loadServiceForms(orgId);
  const form = serviceForm(forms, key);
  const back = { href: "/org/audits", label: "Audits" };

  if (!form) {
    return (
      <DashboardShell title="Carry out an audit" context={context} back={back}>
        <Card>
          <CardContent className="divide-y p-0">
            {forms.map((f) => (
              <Link
                key={f.key}
                href={`/org/audits/new?form=${f.key}${client ? `&client=${client}` : ""}`}
                className="block px-4 py-3 text-sm hover:bg-muted/50"
              >
                <span className="font-medium">{f.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {f.blurb} {intervalLabel(f.due)}.
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const supabase = await createClient();
  const [allClients, { data: staff }, reviewBelow, { data: me }] = await Promise.all([
    form.scope === "client" ? loadDueClients(supabase, orgId) : Promise.resolve([]),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", STAFF_ROLES)
      .order("full_name")
      .limit(1000),
    loadReviewBelow(orgId),
    supabase.from("users").select("full_name").eq("id", context.userId).maybeSingle(),
  ]);
  const clients = clientsFor(form, allClients);

  return (
    <DashboardShell title={form.label} context={context} back={back}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{form.blurb}</p>
        <RunServiceAudit
          form={form}
          clients={clients.map((c) => ({ id: c.id, name: c.name, region: c.region }))}
          initialClient={client && clients.some((c) => c.id === client) ? client : null}
          staff={(staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }))}
          auditorName={(me?.full_name as string | null) ?? ""}
          reviewBelow={reviewBelow}
        />
      </div>
    </DashboardShell>
  );
}
