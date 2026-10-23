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
