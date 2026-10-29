import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImportClients } from "./import-clients";

export default async function ImportClientsPage() {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  return (
    <DashboardShell title="Upload your client list" context={context} back={{ href: "/org/clients", label: "Clients" }}>
      <ImportClients />
    </DashboardShell>
  );
}
