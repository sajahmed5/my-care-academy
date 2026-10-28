/**
 * The two emails a website enquiry produces: one to us with the enquiry, and
 * one to the enquirer confirming we have it.
 *
 * Until now every "Book a demo" button was a mailto: link, so an enquiry only
 * existed if the visitor had a mail client set up and finished writing the
 * email themselves (Saj, 23 Oct 2026). Pure functions, like report-email, so
 * the wording can be tested without sending anything.
 */

import { emailButton, emailLayout, emailQuote, esc } from "@/lib/email-layout";

export interface Enquiry {
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  teamSize: string | null;
  /** Human label, not the URL key — e.g. "Mock CQC inspection". */
  topicLabel: string;
  message: string | null;
  /** The page the visitor pressed the button on, if we know it. */
  pagePath?: string | null;
}

const BRAND = "#134f63";

function row(label: string, value: string): string {
  return `<tr>
    <th align="left" style="padding:6px 12px 6px 0;vertical-align:top;color:#4f6070;font-weight:600;white-space:nowrap">${esc(label)}</th>
    <td style="padding:6px 0;vertical-align:top">${esc(value)}</td>
  </tr>`;
}

/**
 * Straight to the team inbox. The subject leads with the topic so a demo
 * request is distinguishable from a mock-inspection enquiry at a glance, and
 * the reply-to is set to the enquirer so replying needs no copy-and-paste.
 */
export function enquiryNotificationEmail(
  enquiry: Enquiry,
): { subject: string; html: string } {
  const rows = [
    row("Name", enquiry.name),
    row("Email", enquiry.email),
    enquiry.phone ? row("Phone", enquiry.phone) : "",
    enquiry.organisation ? row("Service", enquiry.organisation) : "",
    enquiry.teamSize ? row("Size", enquiry.teamSize) : "",
    row("About", enquiry.topicLabel),
    enquiry.pagePath ? row("From page", enquiry.pagePath) : "",
  ]
    .filter(Boolean)
    .join("");

  const message = (enquiry.message ?? "").trim();
  const messageBlock = message
    ? `<p style="margin:20px 0 4px;font-weight:600">Their message</p>
       <div style="white-space:pre-wrap;border-left:3px solid ${BRAND};padding:8px 12px;background:#f3f7f9">${esc(message)}</div>`
    : `<p style="margin:20px 0 0;color:#4f6070">They didn't leave a message.</p>`;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#17222c">
    <h2 style="margin:0 0 4px">${esc(enquiry.topicLabel)}</h2>
    <p style="margin:0 0 20px;color:#4f6070">New enquiry from the website contact form.</p>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    ${messageBlock}
    <p style="margin-top:24px"><a href="mailto:${esc(enquiry.email)}" style="display:inline-block;background:${BRAND};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reply to ${esc(enquiry.name)}</a></p>
    <p style="color:#888;font-size:12px;margin-top:24px">My Care Academy — sent by the contact form at /contact.</p>
  </div>`;

  return { subject: `${enquiry.topicLabel} — ${enquiry.name}${enquiry.organisation ? `, ${enquiry.organisation}` : ""}`, html };
}

/**
 * "We've got it." Says when to expect a reply and gives the phone number for
 * anyone who would rather not wait — the mailto: form at least left a copy in
 * the sender's own Sent folder, and a visitor should not be worse off than that.
 */
export function enquiryReceivedEmail(
  enquiry: Enquiry,
  origin: string,
): { subject: string; html: string } {
  const message = (enquiry.message ?? "").trim();
  const firstName = enquiry.name.trim().split(/\s+/)[0] || "there";

  const html = emailLayout({
    heading: "Thanks — we've got your enquiry",
    body: `<p>Hi ${esc(firstName)},</p>
    <p>Thanks for getting in touch with My Care Academy about <strong>${esc(enquiry.topicLabel.toLowerCase())}</strong>. One of us will come back to you within one working day.</p>
    <p>If it's urgent, call us on <a href="tel:+441616944701" style="color:#0f8178">0161 694 4701</a> — we're here 9am to 5pm, Monday to Friday.</p>
    ${
      message
        ? `<p style="margin:20px 0 4px;font-weight:600">What you told us</p>
       ${emailQuote(esc(message))}`
        : ""
    }
    ${emailButton(`${origin}/training`, "See the course library")}`,
    footer: "My Care Academy · 107 Wellington Road, Stockport, SK4 2LR · 0161 694 4701<br>You're receiving this because you sent us an enquiry. There's nothing to do with this email — it's just your copy.",
  });

  return { subject: "We've got your enquiry — My Care Academy", html };
}
