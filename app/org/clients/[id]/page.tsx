import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ClientForm, type ClientValues } from "../client-form";
import { ClientConcerns } from "./concerns";
import { ClientForms } from "./forms";

/**
 * One client. Their details today; the QAs, audits, concerns and compliments
 * about them join this page as those features are built (SERVICE-AUDITS.md).
 */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: client }, { data: regionRows }, concernsOn, formsOn] = await Promise.all([
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
    hasFeature(context, "complaints.register"),
    hasFeature(context, "forms.builder"),
  ]);
  if (!client) notFound();
  const regions = [...new Set((regionRows ?? []).map((r) => r.region as string))].sort();
  return (
    <DashboardShell title={client.full_name as string} context={context} back={{ href: "/org/clients", label: "Clients" }}>
      <div className="space-y-8">
        <ClientForm id={id} values={client as ClientValues} regions={regions} />
        {formsOn && <ClientForms supabase={supabase} context={context} clientId={id} />}
        {concernsOn && <ClientConcerns supabase={supabase} clientId={id} />}
      </div>
    </DashboardShell>
  );
}
