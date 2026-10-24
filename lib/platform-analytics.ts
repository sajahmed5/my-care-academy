import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_TIERS, type PackageTier } from "@/lib/organisations";
import { LIST_PRICE_GBP } from "@/lib/pricing";
import { FEATURES } from "@/lib/features";
import { fetchAll } from "@/lib/fetch-all";
import { formatDate } from "./dates";

export interface Slice {
  label: string;
  value: number;
}
export interface FeatureAdoption {
  key: string;
  label: string;
  /** Organisations that can reach it — their package and exceptions combined. */
  organisations: number;
}
export interface CoursePopularity {
  title: string;
  enrolments: number;
  completions: number;
}
export interface PlatformAnalytics {
  tierMix: Slice[];
  /** Every paid feature, with how many organisations have it. */
  adoption: FeatureAdoption[];
  subStatus: Slice[];
  /**
   * List price of every active organisation's package, in GBP. List price, not
   * what each one is charged — discounts live in Stripe — so the tile says so.
   */
  mrr: number;
  coursePopularity: CoursePopularity[];
  completionsByMonth: Slice[];
  totals: {
    orgs: number;
    learners: number;
    certificates: number;
    assessments: number;
    passRate: number;
  };
}

/** An embedded `table(count)` — PostgREST returns it as `[{ count }]`. */
const embeddedCount = (v: unknown): number =>
  (v as { count?: number }[] | null)?.[0]?.count ?? 0;

/**
 * Platform-wide analytics for the superadmin (RLS returns all orgs).
 *
 * Totals are counted by the database, not by downloading the rows: every
 * enrolment, certificate and submitted attempt on the platform used to come
 * down just to be counted — and past 1,000 rows each read was silently
 * truncated, so the tiles would have stopped growing with no error. Only the
 * six months the chart shows are read as rows now.
 */
export async function loadPlatformAnalytics(
  supabase: SupabaseClient,
): Promise<PlatformAnalytics> {
  const MONTHS = 6;
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);

  const [
    { data: orgs },
    { count: learnerCount },
    { count: certCount },
    recentCerts,
    { count: submittedCount },
    { count: passedCount },
    { data: courses },
    { data: ticks },
    exceptions,
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, package_tier, status, subscription_status"),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "learner"),
    supabase.from("certificates").select("id", { count: "exact", head: true }),
    fetchAll<{ issued_at: string }>((from, to) =>
      supabase
        .from("certificates")
        .select("id, issued_at")
        .gte("issued_at", firstMonth.toISOString())
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .not("submitted_at", "is", null),
    supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .not("submitted_at", "is", null)
      .eq("passed", true),
    // Per-course totals counted in the database: one row per course.
    supabase.from("courses").select("id, title, enrolments(count), certificates(count)"),
    supabase.from("tier_features").select("tier_key, feature_key"),
    // Organisations × features grows past the 1,000-row cap long before the
    // other tables here do.
    fetchAll<{ organisation_id: string; feature_key: string; enabled: boolean }>(
      (from, to) =>
        supabase
          .from("organisation_features")
          .select("organisation_id, feature_key, enabled")
          .order("organisation_id")
          .order("feature_key")
          .range(from, to),
    ),
  ]);

  const orgRows = orgs ?? [];

  // Tier mix + subscription status + MRR.
  const tierCount = new Map<PackageTier, number>();
  const subCount = new Map<string, number>();
  let mrr = 0;
  for (const o of orgRows) {
    const tier = (o.package_tier ?? "core") as PackageTier;
    tierCount.set(tier, (tierCount.get(tier) ?? 0) + 1);
    const sub = o.subscription_status ?? "none";
    subCount.set(sub, (subCount.get(sub) ?? 0) + 1);
    // MRR at list price. The agreed-amount field that used to feed this was
    // removed on 24 Oct 2026 as confusing; discounts belong in Stripe.
    if (o.status !== "suspended") mrr += LIST_PRICE_GBP[tier] ?? 0;
  }

  // Adoption, resolved the way has_feature() resolves it: an organisation's
  // exception if it has one, otherwise whether its package includes it.
  const ticked = new Set((ticks ?? []).map((t) => `${t.tier_key}|${t.feature_key}`));
  const exception = new Map(
    exceptions.map((e) => [`${e.organisation_id}|${e.feature_key}`, e.enabled]),
  );
  const adoption: FeatureAdoption[] = FEATURES.filter((f) => !f.isCore).map((f) => ({
    key: f.key,
    label: f.label,
    organisations: orgRows.filter(
      (o) =>
        exception.get(`${o.id}|${f.key}`) ??
        ticked.has(`${o.package_tier}|${f.key}`),
    ).length,
  }));

  const tierMix: Slice[] = PACKAGE_TIERS.map((t) => ({
    label: t.label,
    value: tierCount.get(t.value) ?? 0,
  }));
  const subStatus: Slice[] = [...subCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // Course popularity: enrolments + completions per course, top 10 by enrolments.
  const coursePopularity: CoursePopularity[] = (courses ?? [])
    .map((c) => ({
      title: (c.title as string | null) ?? "Course",
      enrolments: embeddedCount(c.enrolments),
      completions: embeddedCount(c.certificates),
    }))
    .filter((c) => c.enrolments > 0)
    .sort((a, b) => b.enrolments - a.enrolments)
    .slice(0, 10);

  // Growth: completions per month over the last 6 months (oldest → newest).
  const buckets = new Array(MONTHS).fill(0);
  const labels: string[] = [];
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    labels.push(formatDate(d, { month: "short" }));
  }
  for (const c of recentCerts) {
    const d = new Date(c.issued_at);
    if (d < firstMonth) continue;
    const idx =
      (d.getFullYear() - firstMonth.getFullYear()) * 12 +
      (d.getMonth() - firstMonth.getMonth());
    if (idx >= 0 && idx < MONTHS) buckets[idx] += 1;
  }
  const completionsByMonth: Slice[] = buckets.map((value, i) => ({
    label: labels[i],
    value,
  }));

  // Assessment pass rate.
  const submitted = submittedCount ?? 0;
  const passRate =
    submitted > 0 ? Math.round(((passedCount ?? 0) / submitted) * 100) : 0;

  return {
    tierMix,
    adoption,
    subStatus,
    mrr,
    coursePopularity,
    completionsByMonth,
    totals: {
      orgs: orgRows.length,
      learners: learnerCount ?? 0,
      certificates: certCount ?? 0,
      assessments: submitted,
      passRate,
    },
  };
}

/** Format a GBP amount with no decimals (e.g. £1,250). */
export function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
