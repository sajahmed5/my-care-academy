import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
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
  const [{ data: clients }, { data: who }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .order("full_name")
      .limit(1000),
    person
      ? supabase.from("users").select("id, full_name, email").eq("id", person).eq("organisation_id", orgId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <DashboardShell title="Raise a concern" context={context} back={{ href: "/org/complaints", label: "Complaints & safeguarding" }}>
      <ConcernForm
        clients={(clients ?? []).map((c) => ({ id: c.id as string, name: c.full_name as string }))}
        person={who ? { id: who.id as string, name: (who.full_name as string | null) || (who.email as string) } : null}
        clientId={client ?? null}
      />
    </DashboardShell>
  );
}
