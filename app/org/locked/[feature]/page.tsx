import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { LOCKED_COPY } from "@/lib/locked";
import { PACKAGE_TIERS, tierLabel, type PackageTier } from "@/lib/organisations";
import { LIST_PRICE_GBP } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { AskManager } from "./ask-manager";

/**
 * A paid feature the organisation's package leaves out (Saj, 29 Oct 2026).
 * The menu keeps it, padlocked, and brings the manager here: what it does,
 * which package has it, and the way to ask for it. An office worker can't
 * change the package, so they get "ask your manager" instead.
 *
 * Nothing of the organisation's own data is read here — a company that moved
 * down a package still has rows in the feature's tables, and this page must
 * not show them.
 */
export default async function LockedFeaturePage({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const context = await requireConsole();
  const { feature } = await params;
  const key = FEATURES.find((f) => f.key === feature)?.key as FeatureKey | undefined;
  const copy = key ? LOCKED_COPY[key] : undefined;
  if (!key || !copy) notFound();
  if (await hasFeature(context, key)) redirect(copy.home);

  const admin = createAdminClient();
  const [{ data: org }, { data: ticks }] = await Promise.all([
    admin.from("organisations").select("package_tier").eq("id", context.organisationId!).maybeSingle(),
    admin.from("tier_features").select("tier_key").eq("feature_key", key),
  ]);
  const current = (org?.package_tier ?? "core") as PackageTier;
  const ticked = new Set((ticks ?? []).map((t) => t.tier_key as string));
  // The first package up the ladder that has it. None at all means it's sold
  // only by arrangement — a platform admin switches it on for one company.
  const needed = PACKAGE_TIERS.find((t) => ticked.has(t.value))?.value ?? null;
  const manager = context.role === "org_admin";

  return (
    <DashboardShell title={copy.area} context={context}>
      <div className="max-w-2xl overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-start gap-4 p-6 pb-2 sm:p-7 sm:pb-2">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Lock className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
              {needed ? `Part of ${tierLabel(needed)}` : "By arrangement"}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{copy.heading}</h2>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {manager
                ? `This isn't in your ${tierLabel(current)} package.`
                : "This isn't in your company's package."}
              {needed && ` It comes with ${tierLabel(needed)}.`}
            </p>
          </div>
        </div>
        <ul className="grid gap-3 px-6 pt-4 text-sm sm:grid-cols-2 sm:px-7">
          {copy.bullets.map((b) => (
            <li key={b} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t bg-muted/40 px-6 py-5 sm:px-7">
          {manager ? (
            <>
              <Link
                href={needed ? `/org/billing?package=${needed}#change` : "/contact?topic=pricing"}
                className={buttonVariants({ size: "lg" })}
              >
                {needed ? `Upgrade to ${tierLabel(needed)}` : "Ask us about it"}
              </Link>
              <Link href="/org/billing#change" className="text-sm font-medium text-primary hover:underline">
                See what each package includes
              </Link>
              {needed && (
                <span className="text-sm text-muted-foreground">
                  £{LIST_PRICE_GBP[needed]} a month, compared with £{LIST_PRICE_GBP[current]} for {tierLabel(current)}.
                </span>
              )}
            </>
          ) : (
            <AskManager feature={key} />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
