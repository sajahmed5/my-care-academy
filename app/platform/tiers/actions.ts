"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { diffTicks, parseTicks, withCore, type Tick } from "@/lib/tier-composition";
import type { SaveState } from "@/app/platform/actions";

/**
 * Save what each package includes (platform_admin only).
 *
 * Writes through the RLS-scoped client, as updateOrganisationAction does, so
 * the tier_features policies — platform admin only — are what permit it.
 */
export async function saveTierCompositionAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("platform_admin");

  const parsed = parseTicks(formData.getAll("tick").map(String));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const next = withCore(parsed.ticks);

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("tier_features")
    .select("tier_key, feature_key");
  if (readError) return { ok: false, error: readError.message };
  const current: Tick[] = (rows ?? []).map((r) => ({
    tier: r.tier_key as string,
    feature: r.feature_key as string,
  }));

  const { added, removed } = diffTicks(current, next);
  if (added.length === 0 && removed.length === 0) return { ok: true };

  // Additions first. If a removal then fails part-way, packages are left
  // including more than intended, never less — the failure that leaves a
  // customer with the access they paid for.
  if (added.length) {
    const { error } = await supabase
      .from("tier_features")
      .insert(added.map((t) => ({ tier_key: t.tier, feature_key: t.feature })));
    if (error) return { ok: false, error: error.message };
  }
  for (const t of removed) {
    const { error } = await supabase
      .from("tier_features")
      .delete()
      .eq("tier_key", t.tier)
      .eq("feature_key", t.feature);
    if (error) return { ok: false, error: error.message };
  }

  await logAudit({
    context,
    action: "tier.composition.updated",
    entity: "subscription_tier",
    detail: {
      added: added.map((t) => `${t.tier}:${t.feature}`),
      removed: removed.map((t) => `${t.tier}:${t.feature}`),
    },
  });

  revalidatePath("/platform/tiers");
  return { ok: true };
}
