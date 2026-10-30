"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type UserContext } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { REPORT_COLUMNS, type StoredReport } from "@/lib/bespoke/render";
import { nextSendOn, readSchedule, scheduleLabel, storedRecipients } from "@/lib/bespoke/schedule";
import { sendReportNow } from "@/lib/bespoke/send";
import { ukToday } from "@/lib/bespoke/working-days";
import type { SaveState } from "@/app/platform/actions";

/**
 * The company's own settings for its bespoke reports (BESPOKE-REPORTS.md):
 * who sees each one, and who it's emailed to and how often. Managers only;
 * every write is the service role after the role, the package and the
 * report's company have been checked here.
 */

type Admin = ReturnType<typeof createAdminClient>;

async function managerReport(reportId: string): Promise<{ context: UserContext; admin: Admin; report: StoredReport } | null> {
  const context = await requireRole("org_admin");
  if (!context.organisationId || !(await hasFeature(context, "reports.bespoke"))) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("bespoke_reports")
    .select(REPORT_COLUMNS)
    .eq("id", reportId)
    .eq("organisation_id", context.organisationId)
    .is("archived_at", null)
    .maybeSingle();
  return data ? { context, admin, report: data as StoredReport } : null;
}

async function managerSchedule(scheduleId: string) {
  const context = await requireRole("org_admin");
  if (!context.organisationId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("report_schedules")
    .select("id, report_id, frequency, weekday, day_of_month, format, recipients, active")
    .eq("id", scheduleId)
    .eq("organisation_id", context.organisationId)
    .maybeSingle();
  if (!data) return null;
  const found = await managerReport(data.report_id as string);
  return found ? { ...found, schedule: data } : null;
}

const done = () => {
  revalidatePath("/org/settings/reports");
  revalidatePath("/org/reports");
  return { ok: true };
};

/** Keep a report to managers, or let office staff see it too. */
export async function setManagersOnlyAction(reportId: string, managersOnly: boolean): Promise<SaveState> {
  const found = await managerReport(reportId);
  if (!found) return { ok: false, error: "That report wasn't found." };
  const { error } = await found.admin.from("bespoke_reports").update({ managers_only: managersOnly }).eq("id", reportId);
  if (error) return { ok: false, error: "That couldn't be saved. Try again." };
  await logAudit({ context: found.context, action: "bespoke_report.managers_only", entity: "bespoke_report", entityId: reportId, detail: { managersOnly } });
  return done();
}

function formFields(formData: FormData) {
  return {
    frequency: String(formData.get("frequency") ?? ""),
    weekday: String(formData.get("weekday") ?? ""),
    dayOfMonth: String(formData.get("dayOfMonth") ?? ""),
    format: String(formData.get("format") ?? ""),
    names: formData.getAll("name").map(String),
    emails: formData.getAll("email").map(String),
  };
}

/** Add a schedule to a report, or change one. */
export async function saveScheduleAction(
  reportId: string,
  scheduleId: string | null,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const found = await managerReport(reportId);
  if (!found) return { ok: false, error: "That report wasn't found." };
  const input = readSchedule(formFields(formData));
  if (typeof input === "string") return { ok: false, error: input };

  const row = {
    frequency: input.frequency,
    weekday: input.weekday,
    day_of_month: input.dayOfMonth,
    format: input.format,
    recipients: input.recipients,
    next_send_on: nextSendOn(input, ukToday()),
  };
  const { admin, context, report } = found;
  if (scheduleId) {
    const { data, error } = await admin
      .from("report_schedules")
      .update(row)
      .eq("id", scheduleId)
      .eq("report_id", report.id)
      .eq("organisation_id", context.organisationId!)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "The schedule couldn't be saved. Try again." };
  } else {
    const { count } = await admin.from("report_schedules").select("id", { count: "exact", head: true }).eq("report_id", report.id);
    if ((count ?? 0) >= 10) return { ok: false, error: "A report can have 10 schedules at most." };
    const { error } = await admin
      .from("report_schedules")
      .insert({ ...row, organisation_id: context.organisationId, report_id: report.id, created_by: context.userId });
    if (error) return { ok: false, error: "The schedule couldn't be saved. Try again." };
  }
  await logAudit({
    context,
    action: scheduleId ? "report_schedule.updated" : "report_schedule.created",
    entity: "bespoke_report",
    entityId: report.id,
    detail: { schedule: scheduleLabel(input), recipients: input.recipients.length },
  });
  return done();
}

/** Pause a schedule, or start it again from the next day it falls on. */
export async function setScheduleActiveAction(scheduleId: string, active: boolean): Promise<SaveState> {
  const found = await managerSchedule(scheduleId);
  if (!found) return { ok: false, error: "That schedule wasn't found." };
  const s = found.schedule;
  const patch: Record<string, unknown> = { active };
  if (active) {
    patch.next_send_on = nextSendOn(
      { frequency: s.frequency as "weekly" | "monthly", weekday: s.weekday as number | null, dayOfMonth: s.day_of_month as number | null },
      ukToday(),
    );
  }
  const { error } = await found.admin.from("report_schedules").update(patch).eq("id", scheduleId);
  if (error) return { ok: false, error: "That couldn't be saved. Try again." };
  return done();
}

export async function deleteScheduleAction(scheduleId: string): Promise<SaveState> {
  const found = await managerSchedule(scheduleId);
  if (!found) return { ok: false, error: "That schedule wasn't found." };
  const { error } = await found.admin.from("report_schedules").delete().eq("id", scheduleId);
  if (error) return { ok: false, error: "The schedule couldn't be removed. Try again." };
  await logAudit({ context: found.context, action: "report_schedule.deleted", entity: "bespoke_report", entityId: found.report.id });
  return done();
}

/** Send it to the schedule's people now, without moving the schedule. */
export async function sendNowAction(scheduleId: string): Promise<SaveState & { sent?: number }> {
  const found = await managerSchedule(scheduleId);
  if (!found) return { ok: false, error: "That schedule wasn't found." };
  const recipients = storedRecipients(found.schedule.recipients);
  if (recipients.length === 0) return { ok: false, error: "Add someone to send it to first." };
  try {
    const out = await sendReportNow(found.admin, found.report, {
      format: found.schedule.format as "pdf" | "xlsx",
      recipients,
      scheduleId,
      how: null,
      sentBy: found.context.userId,
    });
    revalidatePath("/org/settings/reports");
    if (out.sent === 0) return { ok: false, error: "The email couldn't be sent. Try again later." };
    return out.failed ? { ok: false, error: `Sent to ${out.sent}; ${out.failed} couldn't be sent.` } : { ok: true, sent: out.sent };
  } catch (err) {
    console.error("Send now failed:", (err as Error)?.message);
    return { ok: false, error: "The report couldn't be run. Try again, or tell us." };
  }
}
