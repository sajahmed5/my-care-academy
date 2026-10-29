import crypto from "node:crypto";

/**
 * Signing in to a classroom session by QR code (FACE-TO-FACE.md, 29 Oct
 * 2026). The trainer's screen shows a code for /learn/classroom/<token>; a
 * member of staff scans it on their phone, signs in to their own account if
 * they aren't already, and presses "I'm here".
 *
 * Only the token's hash is stored, so the code can't be read back from the
 * database: showing it again makes a new one, and the old one stops working.
 * It lasts the working day.
 */

export const SIGN_IN_HOURS = 12;

export const newSignInToken = () => crypto.randomBytes(24).toString("base64url");

export const hashSignInToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

export const signInPath = (token: string) => `/learn/classroom/${token}`;

/** Why a code can't be used, in words; null when it can. */
export function signInProblem(
  session: { organisation_id: string; finished_at: string | null; sign_in_expires_at: string | null } | null,
  organisationId: string | null,
  now: Date = new Date(),
): string | null {
  if (!session) return "This code doesn't work any more. Ask the trainer to show it again.";
  if (session.organisation_id !== organisationId) return "This session belongs to another company.";
  if (session.finished_at) return "This session has finished.";
  if (!session.sign_in_expires_at || new Date(session.sign_in_expires_at) < now) {
    return "This code has run out. Ask the trainer to show it again.";
  }
  return null;
}
