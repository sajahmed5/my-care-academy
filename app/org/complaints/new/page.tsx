import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { ConcernForm } from "../new-complaint";

/**
 * Raise a concern. Reached from the list, from a member of staff's file
 * (?person=, who is named on it) or from a client's page (?client=).
 */
export default async function NewConcernPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; client?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { person, client } = await searchParams;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  // The client pick-list a page at a time: one read returns at most 1,000 rows.
  const [clients, { data: who }] = await Promise.all([
    fetchAll<{ id: string; full_name: string }>((f, t) =>
      supabase.from("clients").select("id, full_name").eq("organisation_id", orgId).eq("status", "active").order("full_name").order("id").range(f, t),
    ),
    person
      ? supabase.from("users").select("id, full_name, email").eq("id", person).eq("organisation_id", orgId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <DashboardShell title="Raise a concern" context={context} back={{ href: "/org/complaints", label: "Incidents, complaints & safeguarding" }}>
      <ConcernForm
        clients={clients.map((c) => ({ id: c.id, name: c.full_name }))}
        person={who ? { id: who.id as string, name: (who.full_name as string | null) || (who.email as string) } : null}
        clientId={client ?? null}
      />
    </DashboardShell>
  );
}
