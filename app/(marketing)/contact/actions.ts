"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import {
  enquiryNotificationEmail,
  enquiryReceivedEmail,
  type Enquiry,
} from "@/lib/contact-email";
import { TOPICS, isTeamSize, toTopic } from "./topics";
import type { EnquiryState, EnquiryValues } from "./enquiry";

/** Where website enquiries land. Overridable so a preview can divert them. */
const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

const str = (form: FormData, key: string, max: number): string =>
  (form.get(key) ?? "").toString().trim().slice(0, max);

// Deliberately loose: the only real test of an address is sending to it, and a
// pattern strict enough to be interesting rejects addresses that work.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Handle a website enquiry: the demo requests and "tell me more" messages that
 * used to depend on the visitor's own mail client.
 *
 * Public by design — there is no session to check. The protections are a
 * per-IP throttle, a honeypot field, and length caps on everything stored or
 * emailed. Nothing the visitor types is ever interpolated into HTML unescaped
 * (see lib/contact-email).
 */
export async function submitEnquiryAction(
  _prev: EnquiryState,
  form: FormData,
): Promise<EnquiryState> {
  const values: EnquiryValues = {
    name: str(form, "name", 100),
    email: str(form, "email", 200),
    phone: str(form, "phone", 40),
    organisation: str(form, "organisation", 120),
    teamSize: str(form, "teamSize", 40),
    topic: toTopic(form.get("topic")),
    message: str(form, "message", 4000),
  };

  // Honeypot: a field no sighted visitor sees and no real one fills in. Bots
  // get a success screen rather than a hint about what gave them away.
  if (str(form, "website", 200)) return { status: "sent" };

  const fieldErrors: EnquiryState["fieldErrors"] = {};
  if (!values.name) fieldErrors.name = "Please tell us your name.";
  if (!values.email) fieldErrors.email = "We need an email address to reply to.";
  else if (!EMAIL_RE.test(values.email))
    fieldErrors.email = "That doesn't look like an email address.";
  if (values.teamSize && !isTeamSize(values.teamSize)) values.teamSize = "";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors, values };
  }

  // Throttle per IP. Generous enough that a care manager filling the form in
  // twice — once for training, once for a mock inspection — is never stopped.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`contact:${ip}`, 5, 600_000)) {
    return {
      status: "error",
      error: `You've sent us a few already — please call 0161 694 4701 or email ${INBOX} and we'll pick it up from there.`,
      values,
    };
  }

  const enquiry: Enquiry = {
    name: values.name,
    email: values.email,
    phone: values.phone || null,
    organisation: values.organisation || null,
    teamSize: values.teamSize || null,
    topicLabel: TOPICS[values.topic],
    message: values.message || null,
    pagePath: str(form, "pagePath", 512) || null,
  };

  const notification = enquiryNotificationEmail(enquiry);
  const delivered = await sendEmail({
    to: INBOX,
    subject: notification.subject,
    html: notification.html,
    // So the team replies to the enquirer, not to our own sending address.
    replyTo: enquiry.email,
  });

  // An enquiry we cannot deliver must not be answered with a thank-you page:
  // the visitor would walk away believing we had it. Say so and give them the
  // phone number instead.
  if (!delivered) {
    return {
      status: "error",
      error: `Sorry — something went wrong sending that. Please call 0161 694 4701 or email ${INBOX} and we'll get straight back to you.`,
      values,
    };
  }

  // The enquirer's own copy, and the log entries, are best-effort: the enquiry
  // is already with us, so nothing here may turn a delivered enquiry into an
  // error on screen.
  try {
    const receipt = enquiryReceivedEmail(enquiry, await siteOrigin());
    const acknowledged = await sendEmail({
      to: enquiry.email,
      subject: receipt.subject,
      html: receipt.html,
    });

    const admin = createAdminClient();
    await admin.from("email_log").insert([
      {
        organisation_id: null,
        to_email: INBOX,
        type: "contact_enquiry",
        subject: notification.subject,
        sent: true,
      },
      {
        organisation_id: null,
        to_email: enquiry.email,
        type: "contact_enquiry_ack",
        subject: receipt.subject,
        sent: acknowledged,
      },
    ]);
  } catch (err) {
    console.error("contact enquiry follow-up failed:", err);
  }

  return { status: "sent" };
}
