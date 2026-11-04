import "server-only";
import { randomInt } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Temporary passwords (ACCOUNT-ACCESS.md): a way in for someone whose
 * invitation didn't arrive or didn't work. The platform sets one for anyone in
 * a company, and a manager for their own staff. It's shown once to the person
 * who set it, never emailed, and never stored anywhere but as the password.
 *
 * The account is marked with `password_temporary` in its app_metadata, which
 * Supabase puts in every sign-in token, so the proxy can send the person to
 * choose their own password before anything else without a database call.
 * Only the service role can write app_metadata; the person can't clear it
 * themselves except by choosing a new password (app/auth/set-password).
 */

const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

/**
 * Three groups like "Rkp4-Wzn7-Hbt3": easy to read out over the phone or copy
 * into a text, with no 0/O, 1/l/I to confuse. About 52 bits, and it only has
 * to last until the first sign-in.
 */
export function generateTemporaryPassword(): string {
  const pick = (s: string) => s[randomInt(s.length)];
  const group = () => pick(UPPER) + pick(LOWER) + pick(LOWER) + pick(DIGITS);
  return `${group()}-${group()}-${group()}`;
}

/**
 * Give an account a fresh temporary password and return it. Confirms the
 * email too: an invited person who never opened the invitation has an
 * unconfirmed account, and Supabase won't sign that in with a password.
 */
export async function giveTemporaryPassword(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string> {
  const password = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    app_metadata: { password_temporary: true },
  });
  if (error) throw error;
  return password;
}

/** Clear the mark once the person has chosen their own password. */
export async function clearTemporaryPassword(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { password_temporary: false },
  });
  if (error) throw error;
}
