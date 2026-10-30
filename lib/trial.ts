/**
 * Free trials (TRIAL.md, 30 Oct 2026): seven days of Enterprise, ending at the
 * end of the seventh day in UK time; then the whole company pauses, and its
 * records are kept for 30 days.
 *
 * Pure: no Supabase import, safe in client components. The date lives on
 * organisations.trial_ends_at; null means not on a trial.
 */

import { UK_TIME_ZONE } from "@/lib/dates";

export const TRIAL_DAYS = 7;
/** How long a lapsed trial's records are kept before they're removed. */
export const TRIAL_KEEP_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const ukParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClock(d: Date): { y: number; m: number; d: number; ms: number } {
  const p = Object.fromEntries(ukParts.formatToParts(d).map((x) => [x.type, x.value]));
  const y = Number(p.year);
  const m = Number(p.month);
  const day = Number(p.day);
  // The same moment, read as if UK wall-clock time were UTC.
  const ms = Date.UTC(y, m - 1, day, Number(p.hour), Number(p.minute), Number(p.second), d.getUTCMilliseconds());
  return { y, m, d: day, ms };
}

/** The UK calendar date of a moment, "2026-11-09". */
export function ukDateKey(d: Date): string {
  const w = wallClock(d);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/** A UK calendar date moved by whole days. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The last millisecond of a UK calendar date, 23:59:59.999 GMT or BST. */
export function endOfUkDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // UK time is UTC or one hour ahead; take that offset back off.
  const offset = wallClock(new Date(guess)).ms - guess;
  return new Date(guess - offset);
}

/**
 * When a trial starting on this UK date ends: the end of the day a week
 * later, so one started on Monday 2 November runs to the end of Monday 9th.
 */
export function trialEndFrom(startKey: string): Date {
  return endOfUkDay(addDaysToKey(startKey, TRIAL_DAYS));
}

/** A trial a week longer than it was, still ending at the end of a day. */
export function extendedTrialEnd(current: Date): Date {
  return endOfUkDay(addDaysToKey(ukDateKey(current), TRIAL_DAYS));
}

/** Whole UK calendar days from one date key to another. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / DAY_MS);
}

export type TrialState =
  | { kind: "none" }
  /** daysLeft 0 is the last day. */
  | { kind: "active"; endsAt: Date; daysLeft: number }
  /** removeAt: when the company's records go if it hasn't carried on. */
  | { kind: "ended"; endsAt: Date; removeAt: Date };

export function trialState(trialEndsAt: string | null | undefined, now: Date = new Date()): TrialState {
  if (!trialEndsAt) return { kind: "none" };
  const endsAt = new Date(trialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return { kind: "none" };
  if (now.getTime() > endsAt.getTime()) {
    return { kind: "ended", endsAt, removeAt: new Date(endsAt.getTime() + TRIAL_KEEP_DAYS * DAY_MS) };
  }
  return { kind: "active", endsAt, daysLeft: Math.max(0, daysBetween(ukDateKey(now), ukDateKey(endsAt))) };
}

/** "4 days left", "1 day left", "Last day". */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "Last day";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

export type TrialEmailKind = "two_days" | "last_day";

/**
 * Which trial email the daily job owes a company today, if any: "two_days"
 * once two days or fewer are left (a missed run still sends it), "last_day"
 * on the day it ends. `lastSent` is organisations.trial_email_sent, so a
 * re-run sends nothing new, and an extended trial starts afresh.
 */
export function trialEmailDue(
  trialEndsAt: string | null,
  lastSent: string | null,
  now: Date = new Date(),
): { kind: TrialEmailKind; key: string } | null {
  const trial = trialState(trialEndsAt, now);
  if (trial.kind !== "active") return null;
  const kind: TrialEmailKind | null = trial.daysLeft === 0 ? "last_day" : trial.daysLeft <= 2 ? "two_days" : null;
  if (!kind) return null;
  const key = `${kind}@${trial.endsAt.toISOString()}`;
  if (lastSent === key) return null;
  return { kind, key };
}
