/**
 * Self-serve free trials (TRIAL.md, 6 Nov 2026): a care company signs up on
 * the website and is on a 30-day Enterprise trial straight away, with nobody
 * at our end setting it up. The Care Bureau was the last one set up by hand.
 *
 * Pure: the form's reading and the email to us, so both can be tested
 * without a database or a mailbox. The action that uses them is
 * app/(marketing)/free-trial/actions.ts.
 */

import { esc } from "@/lib/email-layout";
import { SERVICE_TYPES, SIZE_BANDS, serviceTypeLabel, sizeBandLabel } from "@/lib/organisations";

/** What the visitor typed, kept so a rejected form comes back filled in. */
export interface TrialSignupValues {
  orgName: string;
  name: string;
  email: string;
  phone: string;
  serviceType: string;
  sizeBand: string;
  agree: boolean;
}

export type TrialSignupFieldErrors = Partial<Record<keyof TrialSignupValues, string>>;

export const ORG_NAME_MAX = 120;

const str = (form: FormData, key: string, max: number): string =>
  (form.get(key) ?? "").toString().trim().slice(0, max);

// Deliberately loose, as the contact form's is: the only real test of an
// address is sending to it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The sign-up form, read and checked. Field errors are for the visitor. */
export function parseTrialSignup(form: FormData): { values: TrialSignupValues; fieldErrors: TrialSignupFieldErrors } {
  const values: TrialSignupValues = {
    orgName: str(form, "orgName", ORG_NAME_MAX),
    name: str(form, "name", 100),
    email: str(form, "email", 200).toLowerCase(),
    phone: str(form, "phone", 40),
    serviceType: str(form, "serviceType", 20),
    sizeBand: str(form, "sizeBand", 20),
    agree: form.get("agree") === "on",
  };
  const fieldErrors: TrialSignupFieldErrors = {};
  if (!values.orgName) fieldErrors.orgName = "Tell us your company's name.";
  if (!values.name) fieldErrors.name = "Please tell us your name.";
  if (!values.email) fieldErrors.email = "We need an email address to send your welcome to.";
  else if (!EMAIL_RE.test(values.email)) fieldErrors.email = "That doesn't look like an email address.";
  if (!SERVICE_TYPES.some((t) => t.value === values.serviceType)) fieldErrors.serviceType = "Choose the kind of service you run.";
  if (!SIZE_BANDS.some((b) => b.value === values.sizeBand)) fieldErrors.sizeBand = "Choose roughly how many staff you have.";
  if (!values.agree) fieldErrors.agree = "Please tick the box to carry on.";
  return { values, fieldErrors };
}

export interface TrialSignup {
  orgId: string;
  orgName: string;
  name: string;
  email: string;
  phone: string | null;
  serviceType: string;
  sizeBand: string;
  /** "Sunday 6 December", the last day of the trial. */
  endsOn: string;
  /** Whether their welcome email went (it doesn't where sending is off). */
  emailed: boolean;
}

function row(label: string, value: string): string {
  return `<tr>
    <th align="left" style="padding:6px 12px 6px 0;vertical-align:top;color:#4f6070;font-weight:600;white-space:nowrap">${esc(label)}</th>
    <td style="padding:6px 0;vertical-align:top">${esc(value)}</td>
  </tr>`;
}

/**
 * To us, the moment a company signs up: who they are, the trial's end, and
 * a button to the company's platform page. Reply-to is the person, so a
 * welcome call needs no copy-and-paste.
 */
export function trialSignupNotificationEmail(s: TrialSignup, origin: string): { subject: string; html: string } {
  const rows = [
    row("Company", s.orgName),
    row("Name", s.name),
    row("Email", s.email),
    s.phone ? row("Phone", s.phone) : "",
    row("Service", serviceTypeLabel(s.serviceType)),
    row("Size", sizeBandLabel(s.sizeBand)),
    row("Trial ends", `end of ${s.endsOn}`),
  ]
    .filter(Boolean)
    .join("");
  const welcome = s.emailed
    ? `<p style="margin:20px 0 0;color:#4f6070">Their welcome email has gone, with the set-up button.</p>`
    : `<p style="margin:20px 0 0;color:#b42318;font-weight:600">Their welcome email could not be sent. Send them a set-up link from the company's page.</p>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#17222c">
    <h2 style="margin:0 0 4px">${esc(s.orgName)} started a free trial</h2>
    <p style="margin:0 0 20px;color:#4f6070">Signed up on the website, 30 days of Enterprise.</p>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    ${welcome}
    <p style="margin-top:24px"><a href="${esc(`${origin}/platform/organisations/${s.orgId}`)}" style="display:inline-block;background:#134f63;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open ${esc(s.orgName)}</a></p>
    <p style="color:#888;font-size:12px;margin-top:24px">My Care Academy — sent by the free-trial sign-up at /free-trial.</p>
  </div>`;
  return { subject: `Free trial started — ${s.orgName} (${s.name})`, html };
}
