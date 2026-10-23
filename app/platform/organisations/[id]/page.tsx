import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, CheckCircle2, AlertTriangle, MoonStar, UserRoundX } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { isInactive30d, isNeverActive, loadOrgLearners } from "@/lib/org-learners";
import { LearnersTable } from "@/app/org/learners/learners-table";
import { formatMoney, getBillingSummary } from "@/lib/account-billing";
import { EditOrgForm } from "./edit-org-form";
import { OrgAdmins, type OrgPerson } from "./org-admins";
import { OrgNudgeButton } from "../../org-nudge-button";

export default async function OrganisationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { id } = await params;

  const supabase = await createClient();
  const [
    { data: org },
    { data: staff },
    learners,
    { data: subscription },
    { data: overrides },
    { data: ticks },
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "id, name, package_tier, status, service_type, size_band, stripe_customer_id, stripe_subscription_id",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("users")
      .select("id, full_name, email, role, status, created_at")
      .eq("organisation_id", id)
      .order("created_at", { ascending: true }),
    loadOrgLearners(supabase, id),
    supabase
      .from("organisation_subscriptions")
      .select("monthly_amount_pence")
      .eq("organisation_id", id)
      .maybeSingle(),
    supabase
      .from("organisation_features")
      .select("feature_key, enabled, note")
      .eq("organisation_id", id),
    supabase.from("tier_features").select("tier_key, feature_key"),
  ]);

  if (!org) notFound();

  // What Stripe is actually charging, shown beside the agreed amount so the two
  // can't quietly disagree. Best-effort: null if there is no subscription or
  // Stripe can't be reached.
  const { price: stripePrice } = await getBillingSummary({
    stripe_customer_id: org.stripe_customer_id,
    stripe_subscription_id: org.stripe_subscription_id,
  });
  const agreedPence =
    (subscription?.monthly_amount_pence as number | null | undefined) ?? null;
  const stripe = stripePrice
    ? {
        charging: `${formatMoney(stripePrice.amount, stripePrice.currency)} per ${stripePrice.interval}`,
        // Only a monthly GBP price compares with a monthly amount in pence.
        differs:
          agreedPence != null &&
          stripePrice.interval === "month" &&
          stripePrice.currency.toLowerCase() === "gbp" &&
          stripePrice.amount !== agreedPence,
      }
    : null;

  const tierFeatures: Record<string, string[]> = {};
  for (const t of ticks ?? []) {
    (tierFeatures[t.tier_key as string] ??= []).push(t.feature_key as string);
  }

  const nowMs = new Date().getTime();
  // Deactivated accounts (leavers) stay in the table for their history, but
  // the headline numbers describe the current workforce only.
  const current = learners.filter((r) => r.status !== "deactivated");
  const assigned = current.reduce((n, r) => n + r.stats.assigned, 0);
  const completed = current.reduce((n, r) => n + r.stats.completed, 0);
  const completionPct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
  const overdueLearners = current.filter((r) => r.stats.overdue > 0).length;
  // Was "no last_seen_at OR stale", which silently folded never-signed-in
  // staff into "Inactive 30d+" — the same org then read 223 here and 0 on the
  // org's own page under an identical label. Both sides now share one
  // definition and never-signed-in gets its own tile (issue #22).
  const inactive = current.filter((r) => isInactive30d(r, nowMs)).length;
  const neverActive = current.filter(isNeverActive).length;

  const person = (u: NonNullable<typeof staff>[number]): OrgPerson => ({
    id: u.id,
    name: u.full_name || u.email || "Unnamed",
    email: u.email,
    role: u.role,
  });
  const admins = (staff ?? []).filter((u) => u.role === "org_admin").map(person);
  // Only active learners can be usefully promoted — a leaver can't log in.
  const promotable = (staff ?? [])
    .filter((u) => u.role === "learner" && u.status !== "deactivated")
    .map(person);

  return (
    <DashboardShell title={org.name} context={context}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/platform/organisations"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Organisations
          </Link>
          <OrgNudgeButton orgId={org.id} />
        </div>

        {/* Engagement at a glance */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Learners" value={current.length} icon={Users} color="#0284c7" />
          <StatTile label="Assigned training complete" value={`${completionPct}%`} icon={CheckCircle2} color="#10b981" hint={`${completed} of ${assigned} courses`} />
          <StatTile label="With overdue" value={overdueLearners} icon={AlertTriangle} color="#ef4444" />
          <StatTile label="Inactive 30d+" value={inactive} icon={MoonStar} color="#8b5cf6" />
          <StatTile label="Never signed in" value={neverActive} icon={UserRoundX} color="#e11d48" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admins</CardTitle>
            <CardDescription>
              Who can manage this organisation. Role changes apply when that
              person&apos;s session next refreshes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrgAdmins orgId={org.id} admins={admins} promotable={promotable} />
          </CardContent>
        </Card>

        {learners.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Learners</CardTitle>
              <CardDescription>
                {learners.length} in this organisation. Filter by status or
                activity, including deactivated accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Capped: a few hundred rows otherwise buries everything below
                  it, which is what made this page unusable (issues #19/#20). */}
              <div className="max-h-[32rem] overflow-y-auto">
                <LearnersTable rows={learners} readOnly />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Organisation settings</CardTitle>
            <CardDescription>
              Package, size, agreed amount, and any features that differ from
              the package.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditOrgForm
              org={{
                id: org.id,
                name: org.name,
                package_tier: org.package_tier,
                status: org.status,
                service_type: org.service_type,
                size_band: org.size_band,
                monthly_amount_pence: agreedPence,
                learners: current.length,
                overrides: (overrides ?? []).map((o) => ({
                  feature: o.feature_key as string,
                  enabled: o.enabled as boolean,
                  note: (o.note as string | null) ?? null,
                })),
              }}
              tierFeatures={tierFeatures}
              stripe={stripe}
            />
          </CardContent>
        </Card>

      </div>
    </DashboardShell>
  );
}
