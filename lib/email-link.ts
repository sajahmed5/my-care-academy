import type { EmailOtpType } from "@supabase/supabase-js";

/** The kinds of emailed sign-in link that /auth/confirm accepts. */
const LINK_TYPES: readonly EmailOtpType[] = ["invite", "recovery", "magiclink", "email", "signup", "email_change"];

export function emailLinkType(value: string | null | undefined): EmailOtpType | null {
  return LINK_TYPES.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}
