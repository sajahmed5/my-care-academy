import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ClientForm, type ClientValues } from "../client-form";

/**
 * One client. Their details today; the QAs, audits, concerns and compliments
 * about them join this page as those features are built (SERVICE-AUDITS.md).
 */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: client }, { data: regionRows }] = await Promise.all([
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
  ]);
  if (!client) notFound();
  const regions = [...new Set((regionRows ?? []).map((r) => r.region as string))].sort();
  return (
    <DashboardShell title={client.full_name as string} context={context} back={{ href: "/org/clients", label: "Clients" }}>
      <ClientForm id={id} values={client as ClientValues} regions={regions} />
    </DashboardShell>
  );
}
