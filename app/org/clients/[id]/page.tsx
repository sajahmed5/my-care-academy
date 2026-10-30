import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ClientForm, type ClientValues } from "../client-form";
import { ClientConcerns } from "./concerns";
import { ClientQuality } from "./quality";
import { ClientForms } from "./forms";
import { ClientFeedback } from "./feedback";

/**
 * One client: their details, and everything about them over time — QAs,
 * audits, spot checks, concerns and compliments (SERVICE-AUDITS.md, The
 * client page). Without service audits, the concerns and compliments alone.
 */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: client }, { data: regionRows }, enabled] = await Promise.all([
    supabase
      .from("clients")
      .select("full_name, date_of_birth, region, postcode, funder_type, funder_name, medication_support, start_date, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("clients")
      .select("region")
      .eq("organisation_id", context.organisationId!)
      .not("region", "is", null)
      .limit(1000),
    enabledMap(context),
  ]);
  if (!client) notFound();
  const regions = [...new Set((regionRows ?? []).map((r) => r.region as string))].sort();
  const complaintsOn = !!enabled["complaints.register"];
  return (
    <DashboardShell title={client.full_name as string} context={context} back={{ href: "/org/clients", label: "Clients" }}>
      <div className="space-y-8">
        {enabled["quality.audits"] && (
          <ClientQuality
            supabase={supabase}
            organisationId={context.organisationId!}
            client={{
              id,
              name: client.full_name as string,
              region: (client.region as string | null) ?? null,
              medicationSupport: !!client.medication_support,
            }}
            spotChecksOn={!!enabled["people.competency"]}
            complaintsOn={complaintsOn}
          />
        )}
        <section className="space-y-3">
          {enabled["quality.audits"] && <h2 className="text-sm font-semibold">Details</h2>}
          <ClientForm id={id} values={client as ClientValues} regions={regions} />
        </section>
        {enabled["forms.builder"] && <ClientForms supabase={supabase} context={context} clientId={id} />}
        {!enabled["quality.audits"] && complaintsOn && <ClientConcerns supabase={supabase} clientId={id} />}
        {enabled["quality.feedback"] && <ClientFeedback supabase={supabase} clientId={id} />}
      </div>
    </DashboardShell>
  );
}
