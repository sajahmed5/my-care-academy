/**
 * The emails a bespoke report request sends (BESPOKE-REPORTS.md): to us when
 * a company asks or writes on a request, and to the manager who asked when we
 * write back, start building, or have it ready. Pure, like report-email, so
 * the wording can be tested without sending anything.
 */

import { emailButton, emailLayout, emailQuote, esc } from "@/lib/email-layout";
import { formatDate } from "@/lib/dates";
import { audienceLabel, formatLabel, frequencyLabel } from "./requests";

export interface RequestSummary {
  id: string;
  requestNo: number;
  title: string;
  question: string;
  audience: string;
  audienceOther: string | null;
  frequency: string;
  format: string;
  dueOn: string;
}

const due = (iso: string) => formatDate(`${iso}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" });

function row(label: string, value: string): string {
  return `<tr>
    <th align="left" style="padding:4px 12px 4px 0;vertical-align:top;color:#4f6070;font-weight:600;white-space:nowrap">${esc(label)}</th>
    <td style="padding:4px 0;vertical-align:top">${esc(value)}</td>
  </tr>`;
}

/** To us: a company has asked for a report. */
export function newRequestEmail(
  r: RequestSummary,
  org: string,
  who: string,
  origin: string,
): { subject: string; html: string } {
  return {
    subject: `Report request #${r.requestNo} from ${org}: ${r.title}`,
    html: emailLayout({
      heading: "A bespoke report request",
      body: `<p><strong>${esc(org)}</strong> has asked for a report. Asked by ${esc(who)}.</p>
      <table style="border-collapse:collapse;font-size:14px;margin:12px 0">
        ${row("Report", r.title)}
        ${row("For", audienceLabel(r.audience, r.audienceOther))}
        ${row("How often", frequencyLabel(r.frequency))}
        ${row("Format", formatLabel(r.format))}
        ${row("Due by", due(r.dueOn))}
      </table>
      ${emailQuote(esc(r.question))}
      ${emailButton(`${origin}/platform/bespoke-reports/requests/${r.id}`, "Open the request")}`,
      footer: "My Care Academy — a bespoke report request from an Enterprise company.",
    }),
  };
}

/** A message on a request: to us from the company, or to the manager from us. */
export function requestMessageEmail(
  r: Pick<RequestSummary, "id" | "requestNo" | "title">,
  body: string,
  to: "us" | "company",
  from: string,
  origin: string,
): { subject: string; html: string } {
  const href =
    to === "us" ? `${origin}/platform/bespoke-reports/requests/${r.id}` : `${origin}/org/reports/requests/${r.id}`;
  return {
    subject: `Re: report request #${r.requestNo} "${r.title}"`,
    html: emailLayout({
      heading: to === "us" ? "A message on a report request" : "We've written about your report",
      body: `<p>${esc(from)} wrote about <strong>#${r.requestNo} ${esc(r.title)}</strong>:</p>
      ${emailQuote(esc(body))}
      ${emailButton(href, to === "us" ? "Open the request" : "Reply on the request")}`,
      footer:
        to === "us"
          ? "My Care Academy — a message on a bespoke report request."
          : "My Care Academy — you're receiving this because you asked for a bespoke report.",
    }),
  };
}

/** To the manager who asked: we've started, or it's ready. */
export function requestStatusEmail(
  r: Pick<RequestSummary, "id" | "requestNo" | "title" | "dueOn">,
  status: "building" | "ready",
  name: string | null,
  origin: string,
  reportId?: string | null,
): { subject: string; html: string } {
  const hi = `<p>Hi ${esc(name?.trim() || "there")},</p>`;
  if (status === "building") {
    return {
      subject: `We're building your report "${r.title}"`,
      html: emailLayout({
        heading: "Your report is being built",
        body: `${hi}<p>We've started on <strong>#${r.requestNo} ${esc(r.title)}</strong>. It will be ready by ${esc(due(r.dueOn))}.</p>
        ${emailButton(`${origin}/org/reports/requests/${r.id}`, "See the request")}`,
        footer: "My Care Academy — you're receiving this because you asked for a bespoke report.",
      }),
    };
  }
  return {
    subject: `Your report "${r.title}" is ready`,
    html: emailLayout({
      heading: "Your report is ready",
      body: `${hi}<p><strong>#${r.requestNo} ${esc(r.title)}</strong> is ready. It shows your live data whenever you open it, and downloads as a PDF or Excel.</p>
      ${emailButton(reportId ? `${origin}/org/reports/bespoke/${reportId}` : `${origin}/org/reports#our-reports`, "Open the report")}`,
      footer: "My Care Academy — you're receiving this because you asked for a bespoke report.",
    }),
  };
}
