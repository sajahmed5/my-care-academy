import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { STAFF_ROLES } from "@/lib/roles";
import { loadDueClients, loadQaForm, loadReviewBelow } from "@/lib/service-audits-data";
import { ClientQaForm } from "./qa-form";

/** A client QA: `?client=<id>` from the client's page or the due list. */
export default async function NewClientQaPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { client } = await searchParams;
  const orgId = context.organisationId!;
  const supabase = await createClient();
  const [clients, form, reviewBelow, { data: staff }] = await Promise.all([
    loadDueClients(supabase, orgId),
    loadQaForm(orgId),
    loadReviewBelow(orgId),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", STAFF_ROLES)
      .order("full_name")
      .limit(1000),
  ]);
  const people = (staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }));
  const me = people.find((p) => p.id === context.userId) ?? { id: context.userId, name: "" };
  return (
    <DashboardShell title="Client QA" context={context} back={{ href: "/org/audits", label: "Audits" }}>
      <ClientQaForm
        form={form}
        clients={clients}
        initialClient={client && clients.some((c) => c.id === client) ? client : null}
        staff={people.some((p) => p.id === me.id) ? people : [me, ...people]}
        me={me}
        reviewBelow={reviewBelow}
      />
    </DashboardShell>
  );
}
