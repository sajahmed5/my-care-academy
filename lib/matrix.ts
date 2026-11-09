import { formatDate } from "./dates";
/**
 * Training matrix cell wording.
 *
 * Lives here rather than beside the server action because a "use server"
 * module may only export async functions — and because this is the part
 * worth testing.
 */

function ddmmyyyy(iso: string): string {
  return formatDate(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * What one cell says.
 *
 * A blank used to mean three different things — never assigned, assigned and
 * unfinished, or no data — so "not trained" and "nothing to do here" looked
 * identical on the document inspectors actually read (7 Oct 2026).
 */
export function cellText(
  cert: { issued_at: string; expires_at: string | null } | undefined,
  enrolmentStatus: string | undefined,
): string {
  if (cert) {
    return `${ddmmyyyy(cert.issued_at)} → ${cert.expires_at ? ddmmyyyy(cert.expires_at) : "no expiry"}`;
  }
  if (!enrolmentStatus) return "Not assigned";
  if (enrolmentStatus === "in_progress") return "In progress";
  if (enrolmentStatus === "expired") return "Expired — needs retaking";
  return "Assigned, not started";
}

const DAY = 86_400_000;

/**
 * What the Status column says about the person.
 *
 * "Active" used to mean only "not a leaver", so someone who had never signed
 * in was exported as Active and the manager read it as wrong (issue report
 * 102, 7 Nov 2026). The three states are the staff list's own: a leaver is
 * history; no last_seen_at means invited but never signed in (they still have
 * no password); a month without a sign-in is the list's "Not signed in for a
 * month" filter. Otherwise they are active.
 */
export function statusText(
  u: { status: string; last_seen_at: string | null },
  now: number = Date.now(),
): string {
  if (u.status === "deactivated") return "Left";
  if (!u.last_seen_at) return "Never signed in";
  if (now - new Date(u.last_seen_at).getTime() > 30 * DAY) {
    return `Not signed in for a month (last ${ddmmyyyy(u.last_seen_at)})`;
  }
  return "Active";
}
