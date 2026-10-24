/**
 * Supabase auth errors, said the way a carer would understand them.
 *
 * Every sign-in screen used to print `error.message` straight from GoTrue, so
 * a carer who mistyped their password on a phone got "Invalid login
 * credentials" — true, cold, and no hint about what to do next. The people
 * signing in here are carers between visits, office staff and managers, not
 * developers reading an API response.
 *
 * Matching is on a substring of the raw message because GoTrue's wording
 * varies by version and some messages carry a number ("after 54 seconds").
 * Anything unrecognised falls back to a plain sentence rather than the raw
 * string: an unmapped message is a gap in this list, not something to show a
 * carer.
 */

interface Rule {
  /** Lower-cased needle matched against the raw message. */
  match: string;
  message: string;
}

/** Order matters: the first match wins, so put the specific ones first. */
const RULES: Rule[] = [
  {
    match: "invalid login credentials",
    message:
      "That email and password don't match. Check for typos — or use “Forgot your password?” below to set a new one.",
  },
  {
    match: "email not confirmed",
    message:
      "You haven't finished setting up your account yet. Open the invitation email we sent you, or use “Forgot your password?” below to get a fresh link.",
  },
  {
    match: "email logins are disabled",
    message:
      "Sign-in is temporarily unavailable. Please try again shortly, or contact My Care Academy if it continues.",
  },
  {
    match: "user not found",
    message:
      "We couldn't find an account for that email. Check the address, or ask your manager to invite you.",
  },
  {
    match: "user is banned",
    message:
      "This account has been deactivated. Please contact your manager or My Care Academy.",
  },
  // GoTrue's throttle messages: "For security purposes, you can only request
  // this after 54 seconds" and "Request rate limit reached".
  {
    match: "for security purposes",
    message:
      "Too many attempts just now. Please wait a minute and try again.",
  },
  {
    match: "rate limit",
    message:
      "Too many attempts just now. Please wait a minute and try again.",
  },
  {
    match: "too many requests",
    message:
      "Too many attempts just now. Please wait a minute and try again.",
  },
  {
    match: "invalid totp",
    message:
      "That code wasn't right. Check your authenticator app and enter the current 6-digit code.",
  },
  {
    match: "invalid code",
    message:
      "That code wasn't right. Check your authenticator app and enter the current 6-digit code.",
  },
  {
    match: "token has expired or is invalid",
    message:
      "That link has expired. Use “Forgot your password?” to get a new one.",
  },
  {
    match: "same password",
    message: "Choose a password you haven't used here before.",
  },
  {
    match: "should be different from the old password",
    message: "Choose a password you haven't used here before.",
  },
  {
    match: "password should be at least",
    message: "Choose a password of at least 8 characters.",
  },
  {
    match: "password is known to be weak",
    message:
      "That password has appeared in a known data breach. Please choose a different one.",
  },
  {
    match: "session",
    message:
      "You've been signed out. Please sign in again.",
  },
  // Thrown by fetch itself when the device is offline or the API is
  // unreachable — far more common on a phone mid-visit than any of the above.
  {
    match: "failed to fetch",
    message:
      "We couldn't reach My Care Academy. Check your internet connection and try again.",
  },
  {
    match: "network",
    message:
      "We couldn't reach My Care Academy. Check your internet connection and try again.",
  },
];

const FALLBACK =
  "Something went wrong signing you in. Please try again — and if it keeps happening, contact My Care Academy.";

/**
 * Turns a Supabase auth error into a sentence worth showing someone.
 *
 * @param raw the `error.message` from supabase-js, or any thrown error
 * @param fallback what to say when the message isn't one we recognise
 */
export function friendlyAuthError(
  raw: string | null | undefined,
  fallback: string = FALLBACK,
): string {
  if (!raw) return fallback;
  const needle = raw.toLowerCase();
  for (const rule of RULES) {
    if (needle.includes(rule.match)) return rule.message;
  }
  return fallback;
}
