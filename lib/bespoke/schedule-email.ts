/**
 * The email a bespoke report goes out in, on its schedule or when a manager
 * presses Send now (BESPOKE-REPORTS.md). Pure apart from the date, so the
 * wording is tested without sending anything.
 */

import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { formatDate } from "@/lib/dates";
import type { Recipient } from "./schedule";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mycareacademy.co.uk").replace(/\/+$/, "");

export function scheduledReportEmail(
  report: { id: string; title: string },
  organisationName: string,
  recipient: Recipient,
  how: string | null,
  format: "pdf" | "xlsx",
  now: Date,
): { subject: string; html: string } {
  return {
    subject: `${report.title}: ${formatDate(now)}`,
    html: emailLayout({
      heading: esc(report.title),
      body: `<p>Hi ${esc(recipient.name)},</p>
      <p>Here is ${esc(organisationName)}'s report <strong>${esc(report.title)}</strong>, run on ${esc(formatDate(now, { day: "numeric", month: "long", year: "numeric" }))}. It's attached as ${format === "xlsx" ? "an Excel file" : "a PDF"}.</p>
      ${how ? `<p style="color:#587070;font-size:13px">${esc(how)}.</p>` : ""}
      ${emailButton(`${SITE}/org/reports/bespoke/${report.id}`, "Open it live")}
      <p style="color:#587070;font-size:13px">Opening it live needs a manager or office login at ${esc(organisationName)}.</p>`,
      footer: `My Care Academy — sent on behalf of ${esc(organisationName)}, who set up this report to be emailed to you. Ask them to take you off the list.`,
    }),
  };
}

