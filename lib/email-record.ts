/**
 * Copies of account emails (ACCOUNT-ACCESS.md): invitations, password resets,
 * candidate logins and trial emails are recorded in email_log with the email
 * as it was sent, so the platform can open it on a company's Emails tab.
 *
 * A copy must never be a way in. Every sign-in link in it is removed before
 * it's stored: the button points nowhere and is greyed, and the "paste this
 * link" text says the link was removed.
 */

/** The kinds of email that keep a full copy. */
export type AccountEmailType =
  | "invitation"
  | "password_reset"
  | "candidate_invitation"
  | "trial_welcome"
  | "trial_ending";

export const ACCOUNT_EMAIL_TYPES: readonly AccountEmailType[] = [
  "invitation",
  "password_reset",
  "candidate_invitation",
  "trial_welcome",
  "trial_ending",
];

export const ACCOUNT_EMAIL_LABELS: Record<AccountEmailType, string> = {
  invitation: "Invitation",
  password_reset: "Password reset",
  candidate_invitation: "Candidate login",
  trial_welcome: "Welcome to your free trial",
  trial_ending: "Trial ending",
};

/** How long a copy is kept before the daily job clears it. */
export const COPY_KEEP_DAYS = 365;

export interface AccountEmailRecord {
  type: AccountEmailType;
  /** The account the email was about, where there is one. */
  userId?: string | null;
  /** Who caused it to be sent; null for the daily jobs. */
  sentBy?: string | null;
}

/** A sign-in link: the set-up button, a confirm link, or Supabase's own verify link. */
const SIGN_IN_LINK =
  /https?:\/\/[^\s"'<>]*?(?:\/auth\/setup\?t=|\/auth\/confirm\?token_hash=|\/auth\/v1\/verify\?)[^\s"'<>]*/gi;

export const REMOVED_LINK_TEXT = "[sign-in link removed from this copy]";

/** The email with every sign-in link taken out, for storing. */
export function redactSignInLinks(html: string): string {
  return html
    .replace(
      /<a\b([^>]*?)href="([^"]*)"([^>]*)>/gi,
      (tag, before: string, href: string, after: string) => {
        SIGN_IN_LINK.lastIndex = 0;
        if (!SIGN_IN_LINK.test(href.replace(/&amp;/g, "&"))) return tag;
        const rest = `${before}${after}`.replace(/background:#[0-9a-f]{3,8}/i, "background:#9fb7b4");
        return `<a${rest} aria-disabled="true" title="Switched off in this copy">`;
      },
    )
    .replace(SIGN_IN_LINK, REMOVED_LINK_TEXT);
}

/** Store the copy. Never throws: a failed record mustn't fail the send. */
export async function recordAccountEmail(opts: {
  to: string;
  subject: string;
  html: string;
  organisationId?: string | null;
  sent: boolean;
  record: AccountEmailRecord;
}): Promise<void> {
  try {
    const { createAdminClient } = await import("./supabase/admin");
    const { error } = await createAdminClient()
      .from("email_log")
      .insert({
        organisation_id: opts.organisationId ?? null,
        to_email: opts.to,
        type: opts.record.type,
        subject: opts.subject,
        sent: opts.sent,
        html: redactSignInLinks(opts.html),
        user_id: opts.record.userId ?? null,
        sent_by: opts.record.sentBy ?? null,
      });
    if (error) console.error("Account email copy not stored:", error.message);
  } catch (err) {
    console.error("Account email copy not stored:", err);
  }
}

/**
 * The daily job: clear copies older than COPY_KEEP_DAYS. The row stays, as a
 * reminder's does, with its subject line; only the copy goes.
 */
export async function pruneAccountEmailCopies(
  admin: ReturnType<typeof import("./supabase/admin").createAdminClient>,
  now: Date,
  dryRun: boolean,
): Promise<{ emailCopiesCleared: number }> {
  const before = new Date(now.getTime() - COPY_KEEP_DAYS * 86_400_000).toISOString();
  if (dryRun) {
    const { count, error } = await admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .not("html", "is", null)
      .lt("created_at", before);
    if (error) throw new Error(`Email copies couldn't be counted: ${error.message}`);
    return { emailCopiesCleared: count ?? 0 };
  }
  const { data, error } = await admin
    .from("email_log")
    .update({ html: null })
    .not("html", "is", null)
    .lt("created_at", before)
    .select("id");
  if (error) throw new Error(`Email copies couldn't be cleared: ${error.message}`);
  return { emailCopiesCleared: data?.length ?? 0 };
}
