import crypto from "node:crypto";

/**
 * "Set up your account" links for staff who have never signed in (Saj,
 * 30 Oct 2026), in the training-assigned email and the daily reminder.
 *
 * A Supabase set-password link can't go in those emails: it runs out within
 * hours (an hour by default) and each new one cancels the last, so the one in
 * this morning's reminder would be dead by lunch. Instead the email links to
 * /auth/setup with this signed token, and that route makes a fresh
 * set-password link at the moment it's clicked. An email scanner that opens
 * the link first doesn't spoil it for the carer, either.
 *
 * The token is `<user id>.<expiry, unix seconds>.<HMAC>`, signed with a key
 * derived from the service role key, so there is nothing to store. The route
 * only honours it while the person has still never signed in, so it can't
 * be used to get into an account somebody is using.
 */

export const SETUP_LINK_DAYS = 14;

function sign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(`account-setup:${payload}`).digest("base64url");
}

export function setupToken(secret: string, userId: string, now: Date = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + SETUP_LINK_DAYS * 86_400;
  return `${userId}.${exp}.${sign(secret, `${userId}.${exp}`)}`;
}

/** The person a token is for, or null if it's forged, mangled or past its date. */
export function readSetupToken(secret: string, token: string, now: Date = new Date()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, mac] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^\d+$/.test(exp)) return null;
  const expected = Buffer.from(sign(secret, `${userId}.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(exp) * 1000 < now.getTime()) return null;
  return userId;
}

/** The key the tokens are signed with: derived, so there's no new secret to set. */
export function setupSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return crypto.createHash("sha256").update(`mca-account-setup:${key}`).digest("hex");
}

/** The link for an email: on the company's own address, as the rest of the email is. */
export function setupUrl(origin: string, userId: string, now: Date = new Date()): string {
  return `${origin}/auth/setup?t=${encodeURIComponent(setupToken(setupSecret(), userId, now))}`;
}
