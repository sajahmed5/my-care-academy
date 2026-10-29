import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ClientForm } from "../client-form";

export default async function NewClientPage() {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("region")
    .eq("organisation_id", context.organisationId!)
    .not("region", "is", null)
    .limit(1000);
  const regions = [...new Set((data ?? []).map((r) => r.region as string))].sort();
  return (
    <DashboardShell title="Add a client" context={context} back={{ href: "/org/clients", label: "Clients" }}>
      <ClientForm id={null} regions={regions} />
    </DashboardShell>
  );
}
