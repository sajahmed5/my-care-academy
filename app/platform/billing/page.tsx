import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierLabel } from "@/lib/organisations";
import { DashboardShell } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PlatformBillingPage() {
  const context = await requireRole("platform_admin");

  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organisations")
    .select("id, name, package_tier, subscription_status, stripe_customer_id")
    .order("name");

  return (
    <DashboardShell title="Billing" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>
              Plan and subscription status across all organisations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Organisation</th>
                    <th className="py-2 font-medium">Plan</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Stripe customer</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgs ?? []).map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{o.name}</td>
                      <td className="py-2">{tierLabel(o.package_tier)}</td>
                      <td className="py-2">
                        {o.subscription_status ? (
                          <Badge variant="secondary">
                            {o.subscription_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {o.stripe_customer_id ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
