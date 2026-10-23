/**
 * What every dated record on a carer's file has in common.
 *
 * Supervisions came first and spot checks followed with the same two
 * questions behind them: when is the next one due, and what did we agree to
 * do about it? Rather than let the second record type copy the first — which
 * is how two subtly different definitions of "overdue" end up in one product —
 * the shared half lives here, and each record type keeps only what is actually
 * its own.
 *
 * Pure. No I/O, no Supabase, unit-testable.
 */

import { daysUntil } from "./engine-logic";

/** Inside this many days, a next-due date is imminent rather than planned. */
export const DUE_SOON_DAYS = 30;

export type DueStatus = "overdue" | "due_soon" | "scheduled" | "none";

/**
 * Where a next-due date stands.
 *
 * "none" is not a failure. A record with nothing scheduled after it is
 * ordinary, and telling a manager "not scheduled" is more use than inventing a
 * date that then goes red at them.
 */
export function dueStatus(nextDue: string | null, now: Date): DueStatus {
  if (!nextDue) return "none";
  const due = new Date(nextDue);
  if (due.getTime() < now.getTime()) return "overdue";
  return daysUntil(due, now) <= DUE_SOON_DAYS ? "due_soon" : "scheduled";
}

export const MAX_AGREED_ACTIONS = 20;
const MAX_ACTION_TITLE = 200;

/**
 * Turn a "what was agreed" box into action titles, one per line.
 *
 * A textarea rather than a row of inputs because this is typed up straight
 * after the conversation, often on a phone. Blank lines and stray bullets are
 * what people actually paste in, so they are tidied rather than rejected —
 * refusing the save would lose the note as well as the actions.
 */
export function parseAgreedActions(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_AGREED_ACTIONS)
    .map((line) => line.slice(0, MAX_ACTION_TITLE));
}

/**
 * How often each kind of review comes round by default.
 *
 * Saj, 23 Oct 2026: supervisions, spot checks and client quality checks every
 * three months; carer satisfaction every six; six months for anything else we
 * add later. These are DEFAULTS, not rules — an organisation decides its own
 * frequency, and every form lets the date be changed before saving. The point
 * is that a manager recording a supervision should not have to work out when
 * the next one is due, because the one nobody schedules is the one that never
 * happens.
 */
export const REVIEW_INTERVAL_MONTHS = {
  supervision: 3,
  competency: 3,
  client_qa: 3,
  carer_satisfaction: 6,
  other: 6,
} as const;

export type ReviewKind = keyof typeof REVIEW_INTERVAL_MONTHS;

/**
 * The same day, `months` later, clamped to the end of a shorter month.
 *
 * 31 January plus one month is 28 February, not 3 March. JavaScript's Date
 * rolls over by itself, which would quietly schedule a supervision into the
 * following month and look like a bug to the person who booked it.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** When the next one falls due, from the day this one was held. */
export function defaultNextDue(iso: string, kind: ReviewKind): string {
  return addMonths(iso, REVIEW_INTERVAL_MONTHS[kind]);
}
