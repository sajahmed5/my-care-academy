"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sanitiseProbation } from "@/lib/hr/probation";
import { sanitiseOverrides, templateFor } from "@/lib/hr/letters";
import { sanitiseTriggers } from "@/lib/hr/absence";

/**
 * The company's HR setup (HR-PACK.md), under Settings → HR. Managers only:
 * requireRole("org_admin") here and on every page (AGENTS.md).
 */

async function gate() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  return context;
}

/** Upsert some of hr_settings, keeping the rest. */
async function patchSettings(orgId: string, by: string, patch: Record<string, unknown>): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("hr_settings").upsert({ organisation_id: orgId, ...patch, updated_by: by }, { onConflict: "organisation_id" });
  return !error;
}

export async function saveProbationSettingsAction(input: { months: number; reviewMonths: number[]; signatoryName: string; signatoryTitle: string }): Promise<{ ok: boolean; error?: string }> {
  const context = await gate();
  const s = sanitiseProbation(input);
  const words = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  const ok = await patchSettings(context.organisationId!, context.userId, {
    probation_months: s.months,
    probation_review_months: s.reviewMonths,
    letter_signatory_name: words(input.signatoryName),
    letter_signatory_title: words(input.signatoryTitle),
  });
  if (!ok) return { ok: false, error: "The settings couldn't be saved. Try again." };
  await logAudit({ context, action: "hr.settings_saved", entity: "organisation", entityId: context.organisationId!, detail: { probation: s } });
  revalidatePath("/org/settings/hr");
  revalidatePath("/org/hr/probation");
  return { ok: true };
}

/** One letter's wording: blank (or ours, unchanged) goes back to ours. */
export async function saveLetterTemplateAction(kind: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const context = await gate();
  const base = templateFor(kind);
  if (!base) return { ok: false, error: "Unknown letter." };
  const admin = createAdminClient();
  const { data } = await admin.from("hr_settings").select("letter_templates").eq("organisation_id", context.organisationId!).maybeSingle();
  const all = sanitiseOverrides(data?.letter_templates);
  const s = subject.replace(/\s+/g, " ").trim();
  const b = body.replace(/\r/g, "").trim();
  const own = { ...(s && s !== base.subject ? { subject: s } : {}), ...(b && b !== base.body.trim() ? { body: b } : {}) };
  if (Object.keys(own).length) all[kind] = own;
  else delete all[kind];
  const ok = await patchSettings(context.organisationId!, context.userId, { letter_templates: sanitiseOverrides(all) });
  if (!ok) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.letter_template_saved", entity: "organisation", entityId: context.organisationId!, detail: { kind, ours: !Object.keys(own).length } });
  revalidatePath("/org/settings/hr/letters");
  return { ok: true };
}

export async function saveAbsenceSettingsAction(input: { selfReport: boolean; triggers: number[] }): Promise<{ ok: boolean; error?: string }> {
  const context = await gate();
  const triggers = sanitiseTriggers(input.triggers);
  const ok = await patchSettings(context.organisationId!, context.userId, { self_report_sickness: input.selfReport, bradford_triggers: triggers });
  if (!ok) return { ok: false, error: "The settings couldn't be saved. Try again." };
  await logAudit({ context, action: "hr.absence_settings_saved", entity: "organisation", entityId: context.organisationId!, detail: { selfReport: input.selfReport, triggers } });
  revalidatePath("/org/settings/hr/absence");
  revalidatePath("/org/hr/absence");
  return { ok: true };
}
