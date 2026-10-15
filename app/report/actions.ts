"use server";

import { getUserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import { reportReceivedEmail } from "@/lib/report-email";

export interface SubmitReportResult {
  ok: boolean;
  reportNo?: number;
  error?: string;
}

/**
 * File an in-app issue report. Any signed-in user may report. The reporter's
 * identity is stamped from their session (never trusted from the client). An
 * optional screenshot dataURL (captured in-app by the widget) is uploaded to
 * the private issue-screenshots bucket. Returns the human-friendly report_no.
 */
export async function submitReportAction(input: {
  summary: string;
  description?: string;
  pagePath?: string;
  screenshotDataUrl?: string;
}): Promise<SubmitReportResult> {
  const context = await getUserContext();
  if (!context) return { ok: false, error: "Please sign in to report an issue." };

  // Throttle: a handful of reports per user per minute is plenty.
  if (!rateLimit(`report:${context.userId}`, 5, 60_000)) {
    return { ok: false, error: "Too many reports — please wait a moment." };
  }

  const summary = input.summary?.trim();
  if (!summary) return { ok: false, error: "Please describe the issue." };

  const admin = createAdminClient();

  // Upload the screenshot first (best-effort — a failed upload still files the
  // report, just without an image).
  let screenshotPath: string | null = null;
  const dataUrl = input.screenshotDataUrl;
  if (dataUrl && dataUrl.startsWith("data:image/")) {
    const base64 = dataUrl.split(",")[1] ?? "";
    if (base64) {
      const buffer = Buffer.from(base64, "base64");
      const path = `${context.userId}/${crypto.randomUUID()}.png`;
      const { error: upErr } = await admin.storage
        .from("issue-screenshots")
        .upload(path, buffer, { contentType: "image/png", upsert: true });
      if (!upErr) screenshotPath = path;
    }
  }

  const { data, error } = await admin
    .from("issue_reports")
    .insert({
      user_id: context.userId,
      organisation_id: context.organisationId,
      reporter_email: context.email,
      reporter_role: context.role,
      page_path: input.pagePath?.slice(0, 512) ?? null,
      summary: summary.slice(0, 200),
      description: input.description?.trim().slice(0, 5000) || null,
      screenshot_path: screenshotPath,
    })
    .select("report_no")
    .single();

  if (error || !data) {
    return { ok: false, error: "Sorry — we couldn't save that. Please try again." };
  }

  await logAudit({
    context,
    action: "issue_report.created",
    entity: "issue_report",
    entityId: String(data.report_no),
    detail: { summary: summary.slice(0, 200), page: input.pagePath ?? null },
  });

  // Confirm it in writing (issue #47). Best-effort: a mail failure must not
  // lose a report that is already saved, so nothing here can throw into the
  // caller and the widget still shows the number on screen either way.
  if (context.email) {
    try {
      const { data: reporter } = await admin
        .from("users")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const { subject, html } = reportReceivedEmail(
        (reporter?.full_name as string | null) ?? null,
        {
          reportNo: Number(data.report_no),
          summary: summary.slice(0, 200),
          description: input.description?.trim().slice(0, 5000) || null,
        },
        await siteOrigin(),
      );
      const sent = await sendEmail({ to: context.email, subject, html });
      await admin.from("email_log").insert({
        organisation_id: context.organisationId,
        to_email: context.email,
        type: "issue_report_received",
        subject,
        sent,
      });
    } catch (err) {
      console.error("report confirmation email failed:", err);
    }
  }

  return { ok: true, reportNo: Number(data.report_no) };
}
