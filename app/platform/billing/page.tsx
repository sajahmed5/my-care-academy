import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierLabel } from "@/lib/organisations";
import { fetchAll } from "@/lib/fetch-all";
import { allHref, latest } from "@/lib/latest";
import { ViewAll } from "@/components/view-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface OrgRow {
  id: string;
  name: string;
  package_tier: string;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const context = await requireRole("platform_admin");
  const q = await searchParams;

  const supabase = await createClient();
  // Every organisation, paged past the 1,000-row answer, newest first so the
  // page can show the most recent 200; the table itself stays in name order.
  const all = await fetchAll<OrgRow>((from, to) =>
    supabase
      .from("organisations")
      .select("id, name, package_tier, subscription_status, stripe_customer_id, created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const list = latest(all, q.all);
  const orgs = [...list.rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  return (
    <DashboardShell title="Billing" context={context}>
      <div className="space-y-6">
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
                  {orgs.map((o) => (
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
            <ViewAll list={list} href={allHref("/platform/billing", q)} noun="organisations" />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
