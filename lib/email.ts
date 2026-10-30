import { brandEmailHtml, emailButton, emailLayout, emailLinkFallback, esc } from "./email-layout";

const DEFAULT_FROM = "My Care Academy <onboarding@resend.dev>";

/** The From line with another name in front of our sending address. */
export function fromAs(from: string, name: string): string {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  const clean = name.replace(/["\\<>\r\n]/g, "").trim().slice(0, 80);
  return clean ? `"${clean}" <${address}>` : from;
}

/**
 * A company's emails go out as the company, with white label
 * (lib/email-brand): its logo and colour, its name as the sender, replies to
 * its own address unless the caller names someone. Loaded only when asked,
 * so this file stays free of the database for its tests.
 */
async function asCompany(
  organisationId: string | null | undefined,
  html: string,
  replyTo: string | undefined,
): Promise<{ html: string; from: string; replyTo?: string }> {
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  if (!organisationId) return { html, from, replyTo };
  try {
    const { companyEmail } = await import("./email-brand");
    const company = await companyEmail(organisationId);
    if (!company) return { html, from, replyTo };
    return {
      html: brandEmailHtml(html, company.brand),
      from: fromAs(from, company.senderName),
      replyTo: replyTo ?? company.replyTo ?? undefined,
    };
  } catch (err) {
    console.error("Company email branding failed:", err);
    return { html, from, replyTo };
  }
}

/**
 * Send an email via Resend. Returns true if dispatched.
 *
 * `replyTo` exists for mail we send on someone else's behalf — a website
 * enquiry lands in the team inbox from our own sending domain, so without it
 * hitting Reply answers us rather than the person who asked.
 *
 * `organisationId` is the company the email is for: pass it wherever there is
 * one, and with white label the email goes out in its name and dress.
 */
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  attachments,
  organisationId,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Files to attach, as base64 (Resend's limit is 40MB for the whole email). */
  attachments?: { filename: string; content: string }[];
  organisationId?: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const company = await asCompany(organisationId, html, replyTo);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: company.from,
        to,
        subject,
        html: company.html,
        ...(company.replyTo ? { reply_to: company.replyTo } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
    });
    if (!res.ok) console.error("Resend send failed:", res.status);
    return res.ok;
  } catch (err) {
    console.error("Resend send error:", err);
    return false;
  }
}

/** Resend accepts at most this many emails per batch request. */
const BATCH_MAX = 100;

/**
 * Send many emails in as few requests as Resend allows, returning one
 * delivered/failed flag per message in the order given.
 *
 * The scheduled jobs used to send one at a time, each waiting for the last,
 * inside a 60-second limit. After a bulk assignment every learner falls due
 * the same morning, so a large organisation could not finish in time — and
 * whoever wasn't reached simply wasn't told. Batched, 260 learners is three
 * requests instead of 260.
 *
 * Resend rejects a batch as a whole if any message in it is invalid, so a
 * failed request marks its whole chunk as not sent. That is recorded in the
 * email log rather than retried here.
 */
export async function sendEmailBatch(
  messages: { to: string; subject: string; html: string; organisationId?: string | null }[],
): Promise<boolean[]> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return messages.map(() => false);
  const ready = await Promise.all(
    messages.map(async ({ to, subject, html, organisationId }) => {
      const company = await asCompany(organisationId, html, undefined);
      return {
        from: company.from,
        to,
        subject,
        html: company.html,
        ...(company.replyTo ? { reply_to: company.replyTo } : {}),
      };
    }),
  );

  const results: boolean[] = [];
  for (let i = 0; i < ready.length; i += BATCH_MAX) {
    const chunk = ready.slice(i, i + BATCH_MAX);
    let ok = false;
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
      ok = res.ok;
      if (!ok) console.error("Resend batch failed:", res.status, await res.text());
    } catch (err) {
      console.error("Resend batch error:", err);
    }
    results.push(...chunk.map(() => ok));
  }
  return results;
}

interface InviteEmailOptions {
  to: string;
  inviteUrl: string;
  /** e.g. "organisation administrator", "learner". */
  roleLabel: string;
  /** Organisation the invitee is joining, if any. */
  orgName?: string | null;
  /** The same organisation, for its own name and dress with white label. */
  organisationId?: string | null;
}

export interface SendResult {
  /** True if an email was actually dispatched via Resend. */
  sent: boolean;
  /** The invite URL — returned so the UI can show a copyable link fallback. */
  link: string;
}

/**
 * The name an account email speaks in: the company's, with white label, and
 * ours otherwise. An invitation to "My Care Academy" under a company's own
 * logo would read as if from someone else.
 */
async function accountName(organisationId: string | null | undefined): Promise<string | null> {
  if (!organisationId) return null;
  try {
    const { companyEmail } = await import("./email-brand");
    return (await companyEmail(organisationId))?.brand.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends a branded invite email via Resend. If RESEND_API_KEY is not configured
 * (or the send fails), returns sent:false with the link so the caller can show
 * a copyable invite link instead — invites still work without email set up.
 */
export async function sendInviteEmail({
  to,
  inviteUrl,
  roleLabel,
  orgName,
  organisationId,
}: InviteEmailOptions): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) return { sent: false, link: inviteUrl };

  const company = await accountName(organisationId);
  const joining = orgName && !company ? ` for <strong>${esc(orgName)}</strong>` : "";
  const html = emailLayout({
    heading: company ? `You've been invited to ${esc(company)}'s training` : "You've been invited to My Care Academy",
    body: `<p>You've been invited as ${esc(roleLabel)}${joining}. Click below to set your
      password and get started.</p>
      ${emailButton(inviteUrl, "Accept invitation")}
      ${emailLinkFallback(inviteUrl)}`,
    footer: "My Care Academy — you're receiving this because someone invited you.",
  });
  const sent = await sendEmail({
    to,
    subject: company ? `Your invitation from ${company}` : "Your My Care Academy invitation",
    html,
    organisationId,
  });
  return { sent, link: inviteUrl };
}

/**
 * Sends a password-reset email via Resend. Like invites, if email isn't
 * configured it returns sent:false with the link so the flow still works
 * (the caller decides whether to surface it — never to a public visitor).
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  organisationId,
}: {
  to: string;
  resetUrl: string;
  /** The account's company, for its own name and dress with white label. */
  organisationId?: string | null;
}): Promise<SendResult> {
  const company = await accountName(organisationId);
  const html = emailLayout({
    heading: company ? `Reset your ${esc(company)} training password` : "Reset your My Care Academy password",
    body: `<p>We received a request to reset your password. Click below to choose a
      new one. If you didn't ask for this, you can safely ignore this email.</p>
      ${emailButton(resetUrl, "Reset password")}
      ${emailLinkFallback(resetUrl)}`,
    footer: "My Care Academy — sent because a password reset was asked for on your account.",
  });
  const sent = await sendEmail({
    to,
    subject: company ? `Reset your ${company} training password` : "Reset your My Care Academy password",
    html,
    organisationId,
  });
  return { sent, link: resetUrl };
}
