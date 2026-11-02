import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { allHref, latest } from "@/lib/latest";
import { DashboardShell } from "@/components/dashboard-shell";
import { ViewAll } from "@/components/view-all";
import { Card, CardContent } from "@/components/ui/card";
import { loadCompliments } from "@/lib/complaints/compliments";
import { ComplimentCard, ComplimentForm } from "./compliment-form";

/**
 * Compliments, logged beside the concerns: CQC asks about both, and a
 * carer's file reads better with the thanks in it as well as the complaints.
 */
export default async function ComplimentsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { all } = await searchParams;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  // Pick-lists a page at a time: one read returns at most 1,000 rows.
  const [compliments, staff, clients] = await Promise.all([
    loadCompliments(supabase, orgId),
    fetchAll<{ id: string; full_name: string | null; email: string }>((f, t) =>
      supabase
        .from("users")
        .select("id, full_name, email")
        .eq("organisation_id", orgId)
        .eq("status", "active")
        .in("role", ["learner", "org_admin", "org_office"])
        .order("full_name")
        .order("id")
        .range(f, t),
    ),
    hasFeature(context, "clients.list").then(async (on) => {
      if (!on) return [];
      const data = await fetchAll<{ id: string; full_name: string }>((f, t) =>
        supabase.from("clients").select("id, full_name").eq("organisation_id", orgId).eq("status", "active").order("full_name").order("id").range(f, t),
      );
      return data.map((c) => ({ id: c.id, name: c.full_name }));
    }),
  ]);
  const shown = latest(compliments, all);
  return (
    <DashboardShell title="Compliments" context={context} back={{ href: "/org/complaints", label: "Incidents, complaints & safeguarding" }}>
      <div className="space-y-4">
        <ComplimentForm clients={clients} staff={staff.map((u) => ({ id: u.id, name: u.full_name || u.email }))} />
        {compliments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No compliments logged yet. Thanks from a family, a card, a kind word to the office — log it here and it shows on the carer&apos;s file.
            </CardContent>
          </Card>
        ) : (
          <>
            {shown.rows.map((c) => (
              <ComplimentCard key={c.id} compliment={c} canDelete />
            ))}
            <ViewAll list={shown} href={allHref("/org/complaints/compliments")} noun="compliments" />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
