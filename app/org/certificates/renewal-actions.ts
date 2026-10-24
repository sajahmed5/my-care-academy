"use server";

import { requireConsole } from "@/lib/auth";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { certificateState } from "@/lib/certificates";
import { formatDate } from "@/lib/dates";

export interface RenewalResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Chase one learner about a certificate that has lapsed or is about to.
 *
 * The ordinary Remind button can't do this job. It emails about *outstanding*
 * training, and a certificate that expires next month belongs to a course the
 * learner has completed — so there is nothing outstanding and it would send
 * nothing at all. (Once a certificate actually lapses the daily engine flips
 * the enrolment back to "expired", so that half would eventually work; the
 * weeks of warning beforehand are the part that matters and the part that was
 * unreachable.)
 *
 * So this names the certificate, its date, and whether it has already gone.
 * Always sends: a deliberate click on one named person.
 */
export async function remindRenewalAction(
  certificateId: string,
): Promise<RenewalResult> {
  const context = await requireConsole();
  if (!context.organisationId) return { ok: false, error: "No organisation." };

  const admin = createAdminClient();
  const { data: cert } = await admin
    .from("certificates")
    .select(
      "id, organisation_id, expires_at, users(full_name, email), courses(title)",
    )
    .eq("id", certificateId)
    .maybeSingle();

  // Service-role read: this check is what keeps orgs apart.
  if (!cert || cert.organisation_id !== context.organisationId) {
    return { ok: false, error: "Certificate not found." };
  }

  const u = cert.users as unknown as {
    full_name?: string;
    email?: string;
  } | null;
  if (!u?.email) return { ok: false, error: "That learner has no email address." };

  const course =
    (cert.courses as unknown as { title?: string } | null)?.title ?? "a course";
  const { state } = certificateState(cert.expires_at as string | null, new Date());
  if (state === "valid" || state === "no_expiry") {
    return { ok: false, error: "That certificate doesn't need renewing yet." };
  }

  const expiresOn = cert.expires_at
    ? formatDate(cert.expires_at, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const lapsed = state === "expired";
  const origin = await siteOrigin();

  const subject = lapsed
    ? `Your ${course} certificate has expired`
    : `Your ${course} certificate expires soon`;
  const html = `<p>Hi ${u.full_name ?? "there"},</p>
<p>Your <strong>${course}</strong> certificate ${
    lapsed ? `expired on ${expiresOn}` : `expires on ${expiresOn}`
  }, so the course needs retaking to stay compliant.</p>
<p>Please <a href="${origin}/learn">log in and retake it</a>${
    lapsed ? " as soon as you can" : " before it lapses"
  }.</p>
<p>Thank you.</p>`;

  const sent = await sendEmail({ to: u.email, subject, html });
  await admin.from("email_log").insert({
    organisation_id: context.organisationId,
    to_email: u.email,
    type: "org_renewal_nudge",
    subject,
    sent,
  });

  return sent
    ? { ok: true, message: lapsed ? "Renewal chased." : "Reminder sent." }
    : { ok: false, error: "Couldn't send that email." };
}
