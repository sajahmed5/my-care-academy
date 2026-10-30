"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { COMPANY_FIELDS, REVIEW_PERIODS } from "@/lib/policy-library";
import { addMonths } from "@/lib/records";
import type { SaveState } from "@/app/platform/actions";

/**
 * The company's policy setup (POLICIES.md): review periods and the details
 * merged into its policies. Managers only — it sits under Settings.
 */

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const period = (raw: string): number | null => {
  const n = parseInt(raw, 10);
  return (REVIEW_PERIODS as readonly number[]).includes(n) ? n : null;
};

async function gate() {
  const context = await requireRole("org_admin");
  return (await hasFeature(context, "documents.library")) ? context : null;
}

function done() {
  revalidatePath("/org/settings/policies");
  revalidatePath("/org/policies");
  revalidatePath("/org/due/policies");
}

/**
 * A changed period moves the next review of every published policy it
 * governs: from the last time it was reviewed (or published), not from today,
 * so shortening the period can make a review due at once — which is the point.
 */
async function rescheduleReviews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  copies: { id: string; months: number }[],
) {
  if (copies.length === 0) return;
  const ids = copies.map((c) => c.id);
  const [{ data: rows }, { data: reviews }] = await Promise.all([
    supabase.from("organisation_policies").select("id, status, published_at").in("id", ids),
    supabase
      .from("organisation_policy_reviews")
      .select("organisation_policy_id, reviewed_at")
      .eq("organisation_id", organisationId)
      .in("organisation_policy_id", ids),
  ]);
  const lastReview = new Map<string, string>();
  for (const r of reviews ?? []) {
    const id = r.organisation_policy_id as string;
    const at = r.reviewed_at as string;
    if (!lastReview.has(id) || at > lastReview.get(id)!) lastReview.set(id, at);
  }
  for (const c of copies) {
    const row = (rows ?? []).find((r) => r.id === c.id);
    if (!row || row.status !== "published" || !row.published_at) continue;
    const published = row.published_at as string;
    const review = lastReview.get(c.id);
    const from = (review && review > published ? review : published).slice(0, 10);
    await supabase.from("organisation_policies").update({ review_due_on: addMonths(from, c.months) }).eq("id", c.id);
  }
}

export async function savePolicySettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: "Policies are not included in your plan." };
  const orgId = context.organisationId!;
  const months = period(str(formData, "review_months"));
  if (!months) return { ok: false, error: "Choose how often policies are reviewed." };

  const details: Record<string, string | null> = {};
  for (const f of COMPANY_FIELDS) details[f.key] = str(formData, f.key).slice(0, 300) || null;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("organisation_policy_settings")
    .select("review_months")
    .eq("organisation_id", orgId)
    .maybeSingle();
  const { error } = await supabase
    .from("organisation_policy_settings")
    .upsert({ organisation_id: orgId, review_months: months, ...details, updated_by: context.userId });
  if (error) return { ok: false, error: error.message };

  // Every policy on the company's period follows a change to it.
  if ((before?.review_months ?? 12) !== months) {
    const { data: onDefault } = await supabase
      .from("organisation_policies")
      .select("id")
      .eq("organisation_id", orgId)
      .is("review_months", null)
      .limit(500);
    await rescheduleReviews(supabase, orgId, (onDefault ?? []).map((c) => ({ id: c.id as string, months })));
  }

  await logAudit({ context, action: "policy.settings", entity: "organisation", entityId: orgId, detail: { review_months: months } });
  done();
  return { ok: true };
}

/** Each policy's own review period: "default" follows the company's. */
export async function savePolicyPeriodsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: "Policies are not included in your plan." };
  const orgId = context.organisationId!;
  const supabase = await createClient();
  const [{ data: copies }, { data: settings }] = await Promise.all([
    supabase.from("organisation_policies").select("id, review_months").eq("organisation_id", orgId).limit(500),
    supabase.from("organisation_policy_settings").select("review_months").eq("organisation_id", orgId).maybeSingle(),
  ]);
  const companyMonths = (settings?.review_months as number | undefined) ?? 12;
  const changed: { id: string; months: number }[] = [];
  for (const c of copies ?? []) {
    const raw = formData.get(`period:${c.id}`);
    if (raw === null) continue;
    const own = String(raw) === "default" ? null : period(String(raw));
    if (String(raw) !== "default" && own === null) return { ok: false, error: "Choose a review period for each policy." };
    if (own === ((c.review_months as number | null) ?? null)) continue;
    const { error } = await supabase.from("organisation_policies").update({ review_months: own }).eq("id", c.id);
    if (error) return { ok: false, error: error.message };
    changed.push({ id: c.id as string, months: own ?? companyMonths });
  }
  await rescheduleReviews(supabase, orgId, changed);
  if (changed.length) {
    await logAudit({ context, action: "policy.periods", entity: "organisation", entityId: orgId, detail: { changed: changed.length } });
  }
  done();
  return { ok: true };
}
