/**
 * The emails a reporter gets about an issue they raised: one confirming we
 * have it (issue #47), and one whenever support updates it (issue #41).
 * Pure, so the wording and the "is there anything to say" rule can be tested
 * without sending anything.
 */

import { esc } from "@/lib/engine-digest";

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
       <div style="white-space:pre-wrap;border-left:3px solid #2e7291;padding:8px 12px;background:#f3f7f9">${esc(note)}</div>`
    : "";

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#17222c">
    <h2 style="margin:0 0 16px">Your report has been updated</h2>
    <p>Hi ${esc(name?.trim() || "there")},</p>
    <p>Thanks for reporting <strong>#${c.reportNo} ${esc(c.summary)}</strong>.</p>
    <p>Status: <strong>${esc(word)}</strong>${statusChanged ? ` <span style="color:#4f6070">(was ${esc(STATUS_WORDS[c.prevStatus] ?? c.prevStatus)})</span>` : ""}</p>
    ${noteBlock}
    <p style="margin-top:20px"><a href="${origin}/report" style="display:inline-block;background:#2e7291;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">See my reports</a></p>
    <p style="color:#888;font-size:12px;margin-top:24px">My Care Academy — you're receiving this because you reported an issue.</p>
  </div>`;
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
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#17222c">
    <h2 style="margin:0 0 16px">Thanks — we've got your report</h2>
    <p>Hi ${esc(name?.trim() || "there")},</p>
    <p>You reported <strong>#${report.reportNo} ${esc(report.summary)}</strong>. It's with the support team, and we'll email you when there's an update.</p>
    ${
      detail
        ? `<p style="margin:16px 0 4px;font-weight:600">What you told us</p>
       <div style="white-space:pre-wrap;border-left:3px solid #2e7291;padding:8px 12px;background:#f3f7f9">${esc(detail)}</div>`
        : ""
    }
    <p style="margin-top:20px"><a href="${origin}/report" style="display:inline-block;background:#2e7291;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">See my reports</a></p>
    <p style="color:#888;font-size:12px;margin-top:24px">My Care Academy — you're receiving this because you reported an issue. There's nothing to do with this email; keep it for the reference number.</p>
  </div>`;
  return { subject: `We've logged your report #${report.reportNo}: ${report.summary}`, html };
}
