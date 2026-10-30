import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { CheckForm, type ClientOption } from "../../check-form";

/**
 * A spot check, done on a phone in the client's home (STAFF-AUDITS.md).
 * Unannounced: nothing is booked and the carer is not told beforehand.
 */
export default async function NewSpotCheckPage({ params }: { params: Promise<{ userId: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "people.competency");
  const { userId } = await params;
  const supabase = await createClient();
  const withClients = await hasFeature(context, "clients.list");
  const [{ data: person }, clients, forms] = await Promise.all([
    supabase.from("users").select("id, full_name, email, role").eq("id", userId).maybeSingle(),
    withClients
      ? fetchAll((f, t) =>
          supabase
            .from("clients")
            .select("id, full_name, region")
            .eq("organisation_id", context.organisationId!)
            .eq("status", "active")
            .order("full_name")
            .order("id")
            .range(f, t),
        ).then((rows) =>
          rows.map((c): ClientOption => ({
            id: c.id as string,
            name: c.full_name as string,
            region: (c.region as string | null) ?? null,
          })),
        )
      : Promise.resolve(null),
    loadAuditForms(context.organisationId!),
  ]);
  // Carers only: spot checks happen in clients' homes.
  if (!person || person.role !== "learner") notFound();
  const name = (person.full_name as string | null) || (person.email as string);
  return (
    <DashboardShell title={`Spot check — ${name}`} context={context} back={{ href: `/org/staff/${userId}?section=competency`, label: name }}>
      <CheckForm mode="spot_check" userId={userId} personName={name} forms={[forms.spotCheck]} clients={clients} />
    </DashboardShell>
  );
}
