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
