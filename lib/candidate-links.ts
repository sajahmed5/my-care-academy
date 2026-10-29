import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, emailLinkFallback, esc } from "@/lib/email-layout";

/**
 * Links that open a candidate's own page of the recruitment process — their
 * application form today — with no account. Only the SHA-256 of a token is
 * stored (as MyRoster's candidateAccess.ts does), so a database read never
 * hands out a working link.
 */

const DAY = 86_400_000;
export const APPLICATION_LINK_DAYS = 30;

export const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");
export const newToken = () => crypto.randomBytes(24).toString("base64url");

type Admin = ReturnType<typeof createAdminClient>;

/** A fresh link to the application form; the old one stops working. */
export async function issueApplicationLink(admin: Admin, applicationId: string): Promise<string> {
  const raw = newToken();
  await admin
    .from("candidate_applications")
    .update({
      token_hash: hashToken(raw),
      token_expires_at: new Date(Date.now() + APPLICATION_LINK_DAYS * DAY).toISOString(),
      sent_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  return `${await siteOrigin()}/apply/form?t=${raw}`;
}

/** The application a link opens, if the link is real and hasn't run out. */
export async function applicationForToken(admin: Admin, raw: string) {
  if (!raw || raw.length < 20 || raw.length > 64) return null;
  const { data } = await admin
    .from("candidate_applications")
    .select("id, organisation_id, candidate_id, status, answers, office_note, token_expires_at, organisations(name)")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data || !data.token_expires_at || Date.parse(data.token_expires_at as string) < Date.now()) return null;
  return data;
}

/** The email with the link: from the company, by name. */
export async function emailApplicationLink(opts: {
  to: string;
  firstName: string | null;
  company: string;
  link: string;
  note?: string | null;
}): Promise<boolean> {
  const hello = opts.firstName ? `Hello ${esc(opts.firstName)},` : "Hello,";
  const html = emailLayout({
    heading: opts.note ? "Please update your application" : `Your application to ${opts.company}`,
    body: `<p>${hello}</p>
      ${
        opts.note
          ? `<p>${esc(opts.company)} has asked you to change something on your application:</p><p><em>${esc(opts.note)}</em></p>
             <p>Your answers are all still there. Change what's needed, then send it again from the last step.</p>`
          : `<p>Here is your link to the application form for ${esc(opts.company)}. Your answers save as you go, so you can finish it over more than one sitting.</p>`
      }
      ${emailButton(opts.link, opts.note ? "Update my application" : "Open my application")}
      ${emailLinkFallback(opts.link)}
      <p>The link works for ${APPLICATION_LINK_DAYS} days.</p>`,
    footer: `Sent for ${esc(opts.company)} by My Care Academy.`,
  });
  return sendEmail({
    to: opts.to,
    subject: opts.note ? `Please update your application to ${opts.company}` : `Your application to ${opts.company}`,
    html,
  });
}
