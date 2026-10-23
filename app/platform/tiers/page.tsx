import Link from "next/link";
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
import { PACKAGE_TIERS } from "@/lib/organisations";
import { FEATURE_CATEGORIES, FEATURES } from "@/lib/features";
import { TierMatrixForm } from "./tier-matrix-form";

export default async function TiersPage() {
  const context = await requireRole("platform_admin");

  const supabase = await createClient();
  const [{ data: tiers }, { data: ticks }, { data: orgs }] = await Promise.all([
    supabase.from("subscription_tiers").select("key, label, sort_order").order("sort_order"),
    supabase.from("tier_features").select("tier_key, feature_key"),
    supabase.from("organisations").select("package_tier, status"),
  ]);

  // Keep to the fixed set in code order; the label comes from the database.
  const labelOf = new Map((tiers ?? []).map((t) => [t.key as string, t.label as string]));
  const columns = PACKAGE_TIERS.map((t) => {
    const onTier = (orgs ?? []).filter((o) => o.package_tier === t.value);
    return {
      key: t.value,
      label: labelOf.get(t.value) ?? t.label,
      organisations: onTier.filter((o) => o.status !== "suspended").length,
    };
  });

  const ticked = (ticks ?? []).map((t) => `${t.tier_key}|${t.feature_key}`);

  const groups = FEATURE_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    features: FEATURES.filter((f) => f.category === c.key).map((f) => ({
      key: f.key,
      label: f.label,
      isCore: f.isCore,
    })),
  })).filter((g) => g.features.length > 0);

  return (
    <DashboardShell title="Packages" context={context}>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/platform" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>What each package includes</CardTitle>
            <CardDescription>
              Tick a feature to include it in a package. It applies straight
              away to every organisation on that package — except where an
              organisation has its own exception, set on its page. Training is
              in every package and can&apos;t be removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TierMatrixForm columns={columns} groups={groups} ticked={ticked} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
