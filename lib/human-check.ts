import crypto from "node:crypto";

/**
 * A "are you a person?" question for public forms (Saj, 24 Nov 2026: the
 * contact form was getting a lot of spam past its honeypot).
 *
 * The server asks a small sum in words — "What is four plus three?" — and
 * hands the form a token signed over the time it was asked, a one-off nonce
 * and the answer. The answer itself is never in the page: the form only
 * passes if the visitor's reply reproduces the signature. The time inside
 * the token also catches bots that post the instant the page loads, and lets
 * a question go stale so a solved one can't be reused for days.
 *
 * No third party, no cookie, no new secret to set: the key is derived from
 * the service-role key, as account-setup links are.
 */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen"];

/** Faster than any person can read and fill the form in. */
export const MIN_FILL_MS = 3_000;
/** Long enough to leave the tab open over lunch. */
export const MAX_AGE_MS = 3 * 60 * 60_000;

export interface HumanChallenge {
  question: string;
  token: string;
}

export type HumanCheckResult = "ok" | "wrong" | "too-fast" | "expired" | "invalid";

function sign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(`human-check:${payload}`).digest("base64url");
}

export function newHumanChallenge(
  secret: string,
  now: Date = new Date(),
  rand: (max: number) => number = (max) => crypto.randomInt(max),
): HumanChallenge {
  const a = 1 + rand(9);
  const b = 1 + rand(9);
  const t = now.getTime();
  const nonce = crypto.randomBytes(9).toString("base64url");
  return {
    question: `What is ${WORDS[a]} plus ${WORDS[b]}?`,
    token: `${t}.${nonce}.${sign(secret, `${t}.${nonce}.${a + b}`)}`,
  };
}

/** "7", " 7 ", "seven" and "Seven" all count; anything else is no number. */
export function readAnswer(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (/^\d{1,3}$/.test(s)) return Number(s);
  const i = WORDS.indexOf(s);
  return i >= 0 ? i : null;
}

export function checkHumanAnswer(
  secret: string,
  token: string,
  answer: string,
  now: Date = new Date(),
): HumanCheckResult {
  const [t, nonce, sig, ...rest] = token.split(".");
  if (!t || !nonce || !sig || rest.length > 0 || !/^\d+$/.test(t)) return "invalid";
  const age = now.getTime() - Number(t);
  if (age < 0) return "invalid";
  if (age < MIN_FILL_MS) return "too-fast";
  if (age > MAX_AGE_MS) return "expired";
  const n = readAnswer(answer);
  if (n === null) return "wrong";
  const expected = Buffer.from(sign(secret, `${t}.${nonce}.${n}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? "ok" : "wrong";
}

/** The one-off part of a token, so a solved question can be refused a second time. */
export function humanTokenNonce(token: string): string {
  return token.split(".")[1] ?? "";
}

/** The signing key: derived, so there's no new secret to set. */
export function humanCheckSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return crypto.createHash("sha256").update(`mca-human-check:${key}`).digest("hex");
}
