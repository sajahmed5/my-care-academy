/**
 * The email that carries someone's own survey link (FORMS.md, "Sent"): to a
 * family about the care their relative receives, or to a member of staff.
 * Each link is personal, so the round can count who has answered — and on an
 * anonymous round, never what they said.
 *
 * Every send is logged in email_log like the rest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailBatch } from "./email";
import { emailButton, emailLayout, emailLinkFallback, esc } from "./email-layout";

export interface InvitationEmailInput {
  orgName: string;
  roundTitle: string;
  /** "client" goes to a family, "staff" to someone who works there. */
  kind: "client" | "staff";
  named: boolean;
  /** The person written to, when known. */
  name: string | null;
  /** On a family's email: who the care is for. */
  clientName: string | null;
  url: string;
  closesOn: string | null;
}

/** The subject and body. Pure, so it can be tested. */
export function invitationEmail(m: InvitationEmailInput): { subject: string; html: string } {
  const org = esc(m.orgName);
  const hi = `<p>Hi ${esc(m.name || "there")},</p>`;
  const about =
    m.kind === "client"
      ? `<p>${org} would like to know how you feel about the care${m.clientName ? ` ${esc(m.clientName)} receives` : " you receive"}. It takes about two minutes.</p>`
      : `<p>${org} would like to know what it is like to work there. It takes about two minutes.</p>`;
  const privacy =
    m.named
      ? `<p style="color:#555;font-size:14px">Your answers will be seen by ${org}, so they can follow up anything you raise.</p>`
      : `<p style="color:#555;font-size:14px">Your answers are anonymous: ${org} can see that you have answered, but not what you said.</p>`;
  const closes = m.closesOn
    ? `<p style="color:#555;font-size:14px">The survey closes on ${esc(new Date(`${m.closesOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}.</p>`
    : "";
  return {
    subject: m.kind === "client" ? `${m.orgName} would like your feedback` : `${m.orgName}: ${m.roundTitle}`,
    html: emailLayout({
      heading: esc(m.roundTitle),
      body: `${hi}${about}${emailButton(m.url, "Answer the survey")}${privacy}${closes}${emailLinkFallback(m.url)}`,
      footer: `Sent for ${org} by My Care Academy. This link is yours alone — please don't forward it.`,
    }),
  };
}

/**
 * Send a batch of invitations, log each, and stamp the ones that went.
 * Called as the service role, after the office has made the invitations.
 */
export async function sendInvitations(
  admin: SupabaseClient,
  organisationId: string,
  outgoing: { invitationId: string; to: string; subject: string; html: string }[],
): Promise<number> {
  if (outgoing.length === 0) return 0;
  const sent = await sendEmailBatch(outgoing.map(({ to, subject, html }) => ({ to, subject, html, organisationId })));
  await admin.from("email_log").insert(
    outgoing.map((m, i) => ({ organisation_id: organisationId, to_email: m.to, type: "feedback_survey", subject: m.subject, sent: sent[i] })),
  );
  const done = outgoing.filter((_, i) => sent[i]).map((m) => m.invitationId);
  if (done.length) await admin.from("feedback_invitations").update({ sent_at: new Date().toISOString() }).in("id", done);
  return done.length;
}
