"use server";

import { revalidatePath } from "next/cache";
import { onFreeTrial, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

/**
 * A manager switches AI on or off for the company, and sets a monthly limit
 * on what it can be charged (RECRUITMENT.md, "AI").
 */
export async function saveAiSettingsAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  if (await onFreeTrial(context)) return { error: "AI can be switched on once you choose a package." };
  const enabled = formData.get("enabled") === "on";
  const rawLimit = String(formData.get("limit") ?? "").replace(/[£,\s]/g, "");
  const limit = rawLimit === "" ? null : Number(rawLimit);
  if (limit !== null && (!Number.isFinite(limit) || limit < 0 || limit > 10000)) {
    return { error: "Give the limit in pounds, for example 20, or leave it empty for no limit." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("organisation_ai_settings").upsert({
    organisation_id: context.organisationId,
    enabled,
    monthly_limit_gbp: limit === null ? null : Math.round(limit * 100) / 100,
    updated_by: context.userId,
  });
  if (error) return { error: "The AI settings couldn't be saved. Try again." };
  await logAudit({ context, action: "organisation.ai_settings_saved", entity: "organisation", entityId: context.organisationId!, detail: { enabled, limit } });
  revalidatePath("/org/billing");
  return { ok: true };
}
