import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_TIERS, type PackageTier } from "@/lib/organisations";
import { FEATURES } from "@/lib/features";
import { fetchAll } from "@/lib/fetch-all";

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
  payingOrgs: number;
  /** Agreed monthly amounts of active (non-suspended) organisations, in GBP. */
  mrr: number;
  /** Active organisations with no agreed amount recorded, so left out of mrr. */
  orgsWithoutAmount: number;
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

interface JoinedCourse {
  title?: string;
}

/** Platform-wide analytics for the superadmin (RLS returns all orgs). */
export async function loadPlatformAnalytics(
  supabase: SupabaseClient,
): Promise<PlatformAnalytics> {
  const [
    { data: orgs },
    { data: learners, count: learnerCount },
    { data: enrolments },
    { data: certs },
    { data: attempts },
    { data: courses },
    { data: amounts },
    { data: ticks },
    exceptions,
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, package_tier, status, subscription_status, stripe_subscription_id"),
    supabase
      .from("users")
      .select("id", { count: "exact" })
      .eq("role", "learner"),
    supabase.from("enrolments").select("course_id"),
    supabase.from("certificates").select("course_id, issued_at"),
    supabase
      .from("quiz_attempts")
      .select("passed")
      .not("submitted_at", "is", null),
    supabase.from("courses").select("id, title"),
    supabase
      .from("organisation_subscriptions")
      .select("organisation_id, monthly_amount_pence"),
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
  const penceByOrg = new Map(
    (amounts ?? []).map((a) => [a.organisation_id as string, a.monthly_amount_pence as number | null]),
  );
  let payingOrgs = 0;
  let mrrPence = 0;
  let orgsWithoutAmount = 0;
  for (const o of orgRows) {
    const tier = (o.package_tier ?? "core") as PackageTier;
    tierCount.set(tier, (tierCount.get(tier) ?? 0) + 1);
    const sub = o.subscription_status ?? "none";
    subCount.set(sub, (subCount.get(sub) ?? 0) + 1);
    if (o.stripe_subscription_id) payingOrgs += 1;
    // MRR is what active organisations actually agreed to pay, not a list
    // price per package — prices are agreed per customer, by size band. An
    // active organisation with nothing recorded is counted separately rather
    // than as £0, so a missing figure shows up as missing.
    if (o.status !== "suspended") {
      const pence = penceByOrg.get(o.id);
      if (pence == null) orgsWithoutAmount += 1;
      else mrrPence += pence;
    }
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
  const titleById = new Map<string, string>();
  for (const c of courses ?? [])
    titleById.set(c.id, (c as unknown as JoinedCourse).title ?? "Course");
  const enrolByCourse = new Map<string, number>();
  for (const e of enrolments ?? [])
    enrolByCourse.set(e.course_id, (enrolByCourse.get(e.course_id) ?? 0) + 1);
  const compByCourse = new Map<string, number>();
  for (const c of certs ?? [])
    compByCourse.set(c.course_id, (compByCourse.get(c.course_id) ?? 0) + 1);
  const coursePopularity: CoursePopularity[] = [...enrolByCourse.entries()]
    .map(([id, enrolments]) => ({
      title: titleById.get(id) ?? "Course",
      enrolments,
      completions: compByCourse.get(id) ?? 0,
    }))
    .sort((a, b) => b.enrolments - a.enrolments)
    .slice(0, 10);

  // Growth: completions per month over the last 6 months (oldest → newest).
  const MONTHS = 6;
  const now = new Date();
  const buckets = new Array(MONTHS).fill(0);
  const labels: string[] = [];
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1);
    labels.push(d.toLocaleDateString("en-GB", { month: "short" }));
  }
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);
  for (const c of certs ?? []) {
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
  const submitted = attempts ?? [];
  const passed = submitted.filter((a) => a.passed).length;
  const passRate =
    submitted.length > 0 ? Math.round((passed / submitted.length) * 100) : 0;

  return {
    tierMix,
    adoption,
    subStatus,
    payingOrgs,
    mrr: mrrPence / 100,
    orgsWithoutAmount,
    coursePopularity,
    completionsByMonth,
    totals: {
      orgs: orgRows.length,
      learners: learnerCount ?? (learners ?? []).length,
      certificates: (certs ?? []).length,
      assessments: submitted.length,
      passRate,
    },
  };
}

/** Format a GBP amount with no decimals (e.g. £1,250). */
export function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
