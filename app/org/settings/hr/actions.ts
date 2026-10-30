"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sanitiseProbation } from "@/lib/hr/probation";
import { sanitiseOverrides, templateFor } from "@/lib/hr/letters";
import { sanitiseTriggers } from "@/lib/hr/absence";
import { sanitiseLeaveTypes } from "@/lib/hr/holidays";

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

export async function saveHolidaySettingsAction(input: {
  yearStart: string;
  bankHolidaysFromAllowance: boolean;
  maxOffAtOnce: number | null;
  own: Array<{ key: string; label: string; fromAllowance: boolean }>;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await gate();
  const m = /^(\d{2})-(\d{2})$/.exec(input.yearStart);
  const month = Number(m?.[1]);
  const day = Number(m?.[2]);
  // Up to the 28th, so every year has the day.
  if (!m || month < 1 || month > 12 || day < 1 || day > 28) return { ok: false, error: "Choose the day the leave year starts (the 1st to the 28th)." };
  const max = input.maxOffAtOnce === null ? null : Math.round(Number(input.maxOffAtOnce));
  if (max !== null && (!Number.isFinite(max) || max < 1 || max > 500)) return { ok: false, error: "The limit is a number of people, or leave it blank." };
  const own = sanitiseLeaveTypes(input.own);
  const ok = await patchSettings(context.organisationId!, context.userId, {
    leave_year_start: input.yearStart,
    bank_holidays_from_allowance: input.bankHolidaysFromAllowance,
    max_off_at_once: max,
    leave_types: own,
  });
  if (!ok) return { ok: false, error: "The settings couldn't be saved. Try again." };
  await logAudit({ context, action: "hr.holiday_settings_saved", entity: "organisation", entityId: context.organisationId!, detail: { yearStart: input.yearStart, max, own: own.length } });
  revalidatePath("/org/settings/hr/holidays");
  revalidatePath("/org/hr/holidays");
  return { ok: true };
}

export async function saveCaseSettingsAction(input: {
  warningFirstMonths: number;
  warningFinalMonths: number;
  hearingNoticeDays: number;
  appealDays: number;
  grievanceAckDays: number;
  officeAccess: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const context = await gate();
  const n = (v: number, lo: number, hi: number) => Math.round(Number(v)) >= lo && Math.round(Number(v)) <= hi;
  if (!n(input.warningFirstMonths, 1, 36) || !n(input.warningFinalMonths, 1, 36)) return { ok: false, error: "Warnings last 1 to 36 months." };
  if (!n(input.hearingNoticeDays, 1, 30) || !n(input.appealDays, 1, 30) || !n(input.grievanceAckDays, 1, 30)) return { ok: false, error: "Timescales are 1 to 30 days." };
  // Only this company's office workers can be given access.
  const admin = createAdminClient();
  const { data: office } = await admin.from("users").select("id").eq("organisation_id", context.organisationId!).eq("role", "org_office");
  const allowed = new Set((office ?? []).map((u) => u.id as string));
  const access = [...new Set(input.officeAccess)].filter((id) => allowed.has(id));
  const ok = await patchSettings(context.organisationId!, context.userId, {
    warning_first_months: Math.round(input.warningFirstMonths),
    warning_final_months: Math.round(input.warningFinalMonths),
    hearing_notice_days: Math.round(input.hearingNoticeDays),
    appeal_days: Math.round(input.appealDays),
    grievance_ack_days: Math.round(input.grievanceAckDays),
    case_office_access: access,
  });
  if (!ok) return { ok: false, error: "The settings couldn't be saved. Try again." };
  await logAudit({ context, action: "hr.case_settings_saved", entity: "organisation", entityId: context.organisationId!, detail: { officeAccess: access } });
  revalidatePath("/org/settings/hr/cases");
  return { ok: true };
}
