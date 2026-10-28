/**
 * The emails a reporter gets about an issue they raised: one confirming we
 * have it (issue #47), and one whenever support updates it (issue #41).
 * Pure, so the wording and the "is there anything to say" rule can be tested
 * without sending anything.
 */

import { emailButton, emailLayout, emailQuote, esc } from "@/lib/email-layout";

const STATUS_WORDS: Record<string, string> = {
  open: "Open",
  reviewing: "Being looked at",
  resolved: "Resolved",
};

export interface ReportChange {
  reportNo: number;
  summary: string;
  prevStatus: string;
  status: string;
  prevNote: string | null;
  note: string | null;
}

const clean = (s: string | null) => (s ?? "").trim();

/** Whether a save changed anything the reporter would care about. */
export function reportChanged(c: ReportChange): boolean {
  return c.prevStatus !== c.status || clean(c.prevNote) !== clean(c.note);
}

export function reportUpdateEmail(
  name: string | null,
  c: ReportChange,
  origin: string,
): { subject: string; html: string } {
  const statusChanged = c.prevStatus !== c.status;
  const word = STATUS_WORDS[c.status] ?? c.status;
  const subject = statusChanged
    ? `Your report #${c.reportNo} "${c.summary}" is now ${word.toLowerCase()}`
    : `Update on your report #${c.reportNo} "${c.summary}"`;

  const note = clean(c.note);
  const noteBlock = note
    ? `<p style="margin:16px 0 4px;font-weight:600">Note from the support team</p>
       ${emailQuote(esc(note))}`
    : "";

  const html = emailLayout({
    heading: "Your report has been updated",
    body: `<p>Hi ${esc(name?.trim() || "there")},</p>
    <p>Thanks for reporting <strong>#${c.reportNo} ${esc(c.summary)}</strong>.</p>
    <p>Status: <strong>${esc(word)}</strong>${statusChanged ? ` <span style="color:#587070">(was ${esc(STATUS_WORDS[c.prevStatus] ?? c.prevStatus)})</span>` : ""}</p>
    ${noteBlock}
    ${emailButton(`${origin}/report`, "See my reports")}`,
    footer: "My Care Academy — you're receiving this because you reported an issue.",
  });
  return { subject, html };
}

/**
 * "We've got it." Sent the moment someone files a report.
 *
 * Norwood tested whether filing a log emailed them and found nothing, because
 * we only emailed on an update (issue #47). The popup shows the number on
 * screen, but people expect something in writing — and without it there's no
 * way to tell the Report button worked.
 */
export function reportReceivedEmail(
  name: string | null,
  report: { reportNo: number; summary: string; description?: string | null },
  origin: string,
): { subject: string; html: string } {
  const detail = (report.description ?? "").trim();
  const html = emailLayout({
    heading: "Thanks — we've got your report",
    body: `<p>Hi ${esc(name?.trim() || "there")},</p>
    <p>You reported <strong>#${report.reportNo} ${esc(report.summary)}</strong>. It's with the support team, and we'll email you when there's an update.</p>
    ${
      detail
        ? `<p style="margin:16px 0 4px;font-weight:600">What you told us</p>
       ${emailQuote(esc(detail))}`
        : ""
    }
    ${emailButton(`${origin}/report`, "See my reports")}`,
    footer: "My Care Academy — you're receiving this because you reported an issue. There's nothing to do with this email; keep it for the reference number.",
  });
  return { subject: `We've logged your report #${report.reportNo}: ${report.summary}`, html };
}
