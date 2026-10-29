import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadCompliments } from "@/lib/complaints/compliments";
import { ComplimentCard, ComplimentForm } from "./compliment-form";

/**
 * Compliments, logged beside the concerns: CQC asks about both, and a
 * carer's file reads better with the thanks in it as well as the complaints.
 */
export default async function ComplimentsPage() {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [compliments, { data: staff }, clients] = await Promise.all([
    loadCompliments(supabase, orgId),
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", ["learner", "org_admin", "org_office"])
      .order("full_name")
      .limit(1000),
    hasFeature(context, "clients.list").then(async (on) => {
      if (!on) return [];
      const { data } = await supabase.from("clients").select("id, full_name").eq("organisation_id", orgId).eq("status", "active").order("full_name").limit(1000);
      return (data ?? []).map((c) => ({ id: c.id as string, name: c.full_name as string }));
    }),
  ]);
  return (
    <DashboardShell title="Compliments" context={context} back={{ href: "/org/complaints", label: "Complaints & safeguarding" }}>
      <div className="space-y-4">
        <ComplimentForm
          clients={clients}
          staff={(staff ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }))}
        />
        {compliments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No compliments logged yet. Thanks from a family, a card, a kind word to the office — log it here and it shows on the carer&apos;s file.
            </CardContent>
          </Card>
        ) : (
          compliments.map((c) => <ComplimentCard key={c.id} compliment={c} canDelete />)
        )}
      </div>
    </DashboardShell>
  );
}
