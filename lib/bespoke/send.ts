import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { sendEmail } from "@/lib/email";
import { REPORT_COLUMNS, reportFile, type StoredReport } from "./render";
import { movesScheduleOn, nextSendOn, scheduleLabel, SEND_FROM_HOUR, storedRecipients, ukHour, type Recipient } from "./schedule";
import { ukToday } from "./working-days";
import { scheduledReportEmail } from "./schedule-email";

/**
 * Sending a bespoke report by email (BESPOKE-REPORTS.md): on its schedule,
 * from /api/cron/reports, or straight away when a manager presses Send now.
 * The report is run when it is sent, so the attachment is that day's data.
 * One email per person, so nobody sees who else gets it.
 */

/** Stop starting new sends after this long: the function has 60 seconds. */
const BUDGET_MS = 40_000;

export interface SendOutcome {
  sent: number;
  failed: number;
}

/** Run a report now and email it to each recipient, recording the send. */
export async function sendReportNow(
  admin: SupabaseClient,
  report: StoredReport,
  opts: { format: "pdf" | "xlsx"; recipients: Recipient[]; scheduleId: string | null; how: string | null; sentBy: string | null; now?: Date },
): Promise<SendOutcome> {
  const now = opts.now ?? new Date();
  const [{ data: org }, file] = await Promise.all([
    admin.from("organisations").select("name").eq("id", report.organisation_id).maybeSingle(),
    reportFile(admin, report, opts.format, now),
  ]);
  const organisationName = (org?.name as string | undefined) ?? "Your company";
  const attachment = { filename: file.filename, content: Buffer.from(file.body).toString("base64") };

  const results = await Promise.all(
    opts.recipients.map((r) =>
      sendEmail({
        to: r.email,
        ...scheduledReportEmail(report, organisationName, r, opts.how, opts.format, now),
        attachments: [attachment],
        organisationId: report.organisation_id,
      }),
    ),
  );
  const sentTo = opts.recipients.filter((_, i) => results[i]).map((r) => r.email);
  const failed = opts.recipients.length - sentTo.length;
  await admin.from("report_sends").insert({
    organisation_id: report.organisation_id,
    report_id: report.id,
    schedule_id: opts.scheduleId,
    recipients: sentTo,
    format: opts.format,
    ok: failed === 0,
    error: failed ? `${failed} of ${opts.recipients.length} couldn't be sent.` : null,
    sent_by: opts.sentBy,
  });
  return { sent: sentTo.length, failed };
}

interface DueSchedule {
  id: string;
  organisation_id: string;
  report_id: string;
  frequency: "weekly" | "monthly";
  weekday: number | null;
  day_of_month: number | null;
  format: "pdf" | "xlsx";
  recipients: unknown;
  next_send_on: string;
}

/**
 * Send every scheduled report that is due (next_send_on today or before,
 * from 7am UK time). The cron runs hourly, so anything the 60 seconds don't
 * reach, or that failed, goes on the next run. A dry run reads and counts, and neither sends
 * nor writes.
 */
export async function processScheduledReports(
  admin: SupabaseClient,
  now: Date,
  dryRun: boolean,
): Promise<{ reportsDue: number; reportsSent: number; reportEmails: number; reportEmailsFailed: number; reportsSkipped: number; reportsLeft: number }> {
  const today = ukToday(now);
  const result = { reportsDue: 0, reportsSent: 0, reportEmails: 0, reportEmailsFailed: 0, reportsSkipped: 0, reportsLeft: 0 };
  if (ukHour(now) < SEND_FROM_HOUR) return result;

  const due = await fetchAll<DueSchedule>((from, to) =>
    admin
      .from("report_schedules")
      .select("id, organisation_id, report_id, frequency, weekday, day_of_month, format, recipients, next_send_on")
      .eq("active", true)
      .lte("next_send_on", today)
      .order("id")
      .range(from, to),
  );
  result.reportsDue = due.length;
  if (dryRun || due.length === 0) return result;

  const started = Date.now();
  const allowed = new Map<string, boolean>();
  for (const s of due) {
    if (Date.now() - started > BUDGET_MS) {
      result.reportsLeft += 1;
      continue;
    }
    const sched = { frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.day_of_month, format: s.format };
    // Moved on only after the report has run and gone (movesScheduleOn); a
    // run the 60 seconds cut short is tried again next hour. One that can
    // never go — feature off, report archived, nobody to send to — moves on.
    const moveOn = () => admin.from("report_schedules").update({ next_send_on: nextSendOn(sched, today) }).eq("id", s.id);

    if (!allowed.has(s.organisation_id)) {
      allowed.set(s.organisation_id, await hasFeatureForOrg(admin, s.organisation_id, "reports.bespoke"));
    }
    const { data: report } = await admin.from("bespoke_reports").select(REPORT_COLUMNS).eq("id", s.report_id).is("archived_at", null).maybeSingle();
    const recipients = storedRecipients(s.recipients);
    if (!allowed.get(s.organisation_id) || !report || recipients.length === 0) {
      await moveOn();
      result.reportsSkipped += 1;
      continue;
    }
    try {
      const out = await sendReportNow(admin, report as StoredReport, {
        format: s.format,
        recipients,
        scheduleId: s.id,
        how: `Sent ${scheduleLabel(sched).replace(/^./, (c) => c.toLowerCase())}`,
        sentBy: null,
        now,
      });
      result.reportEmails += out.sent;
      result.reportEmailsFailed += out.failed;
      if (movesScheduleOn(out.sent, s.next_send_on, today)) await moveOn();
      if (out.sent > 0) {
        await admin.from("report_schedules").update({ last_sent_at: now.toISOString() }).eq("id", s.id);
        result.reportsSent += 1;
      }
    } catch (err) {
      console.error("Scheduled report failed:", s.id, (err as Error)?.message);
      await admin.from("report_sends").insert({
        organisation_id: s.organisation_id,
        report_id: s.report_id,
        schedule_id: s.id,
        format: s.format,
        ok: false,
        error: "The report couldn't be run.",
      });
      result.reportEmailsFailed += recipients.length;
      if (movesScheduleOn(0, s.next_send_on, today)) await moveOn();
    }
  }
  return result;
}
