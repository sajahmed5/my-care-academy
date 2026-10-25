/**
 * Retention: 7 years (Saj, 26 Oct 2026).
 *
 *   a leaver's records    7 years after they left (users.deactivated_at)
 *   a complaint           7 years after it was closed, withdrawn or cancelled
 *   an incident           7 years after it was closed
 *
 * Current staff and open records are never past retention, however old. And
 * nothing is deleted automatically: what has passed is listed for a manager,
 * who deletes it. Pure, so the rule is tested rather than trusted.
 */

export const RETENTION_YEARS = 7;

/** The date before which a leaving or closing date is past retention. */
export function retentionCutoff(now: Date): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}

/** True when a leaving / closing date is more than seven years ago. */
export function isPastRetention(endedOn: string | null | undefined, now: Date): boolean {
  if (!endedOn) return false;
  return endedOn.slice(0, 10) < retentionCutoff(now);
}

/** When the record may be deleted, for "kept until …" lines. */
export function keptUntil(endedOn: string): string {
  const d = new Date(`${endedOn.slice(0, 10)}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}
