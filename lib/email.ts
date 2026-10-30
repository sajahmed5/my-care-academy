import { emailButton, emailLayout, emailLinkFallback, esc } from "./email-layout";

/**
 * Send an email via Resend. Returns true if dispatched.
 *
 * `replyTo` exists for mail we send on someone else's behalf — a website
 * enquiry lands in the team inbox from our own sending domain, so without it
 * hitting Reply answers us rather than the person who asked.
 */
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Files sent with it — a scheduled report's PDF or Excel. Content is base64. */
  attachments?: { filename: string; content: string }[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ?? "My Care Academy <onboarding@resend.dev>";
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
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
  messages: { to: string; subject: string; html: string }[],
): Promise<boolean[]> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ?? "My Care Academy <onboarding@resend.dev>";
  if (!apiKey) return messages.map(() => false);

  const results: boolean[] = [];
  for (let i = 0; i < messages.length; i += BATCH_MAX) {
    const chunk = messages.slice(i, i + BATCH_MAX);
    let ok = false;
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk.map((m) => ({ from, ...m }))),
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
}

export interface SendResult {
  /** True if an email was actually dispatched via Resend. */
  sent: boolean;
  /** The invite URL — returned so the UI can show a copyable link fallback. */
  link: string;
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
}: InviteEmailOptions): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ?? "My Care Academy <onboarding@resend.dev>";

  if (!apiKey) return { sent: false, link: inviteUrl };

  const joining = orgName ? ` for <strong>${esc(orgName)}</strong>` : "";
  const html = emailLayout({
    heading: "You've been invited to My Care Academy",
    body: `<p>You've been invited as ${esc(roleLabel)}${joining}. Click below to set your
      password and get started.</p>
      ${emailButton(inviteUrl, "Accept invitation")}
      ${emailLinkFallback(inviteUrl)}`,
    footer: "My Care Academy — you're receiving this because someone invited you.",
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Your My Care Academy invitation",
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend send failed:", res.status, await res.text());
      return { sent: false, link: inviteUrl };
    }
    return { sent: true, link: inviteUrl };
  } catch (err) {
    console.error("Resend send error:", err);
    return { sent: false, link: inviteUrl };
  }
}

/**
 * Sends a password-reset email via Resend. Like invites, if email isn't
 * configured it returns sent:false with the link so the flow still works
 * (the caller decides whether to surface it — never to a public visitor).
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}): Promise<SendResult> {
  const html = emailLayout({
    heading: "Reset your My Care Academy password",
    body: `<p>We received a request to reset your password. Click below to choose a
      new one. If you didn't ask for this, you can safely ignore this email.</p>
      ${emailButton(resetUrl, "Reset password")}
      ${emailLinkFallback(resetUrl)}`,
    footer: "My Care Academy — sent because a password reset was asked for on your account.",
  });
  const sent = await sendEmail({
    to,
    subject: "Reset your My Care Academy password",
    html,
  });
  return { sent, link: resetUrl };
}
