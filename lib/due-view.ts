/**
 * The organisation-wide "who's due" view (ROADMAP §3): every current carer
 * with when their next supervision or spot check falls, so a manager can work
 * from "who is due this month" instead of opening one file at a time.
 *
 * Pure: the pages read the rows, this decides what each person's line says,
 * using the same dueStatus() as the carer's file so the two never disagree.
 */

import { dueStatus, type DueStatus } from "./records";

export interface DuePerson {
  id: string;
  name: string;
}

/** One dated record, newest first per person as the pages read them. */
export interface DueRecord {
  userId: string;
  heldOn: string;
  nextDue: string | null;
  /** For spot checks, the area — each area falls due on its own. */
  area?: string;
}

/** "never" is a person with no record at all — distinct from one with no date set. */
export type DueRowStatus = DueStatus | "never";

export interface DueRow {
  person: DuePerson;
  last: string | null;
  next: string | null;
  status: DueRowStatus;
  /** The soonest booked date still to come, for supervisions and appraisals. */
  booked?: string | null;
}

/** A booked supervision or appraisal (spot checks are never booked). */
export interface DueBooking {
  userId: string;
  on: string;
}

/** The order a manager works in: what is late, then what is close, then the rest. */
export const DUE_ORDER: DueRowStatus[] = ["overdue", "due_soon", "never", "none", "scheduled"];

export const DUE_GROUP_LABEL: Record<DueRowStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due in the next 30 days",
  never: "Never had one",
  none: "Nothing scheduled",
  scheduled: "Due later",
};

/**
 * Each person's line. With areas (spot checks), the next date is the soonest
 * across each area's latest check, as nextDueAcrossAreas() does on the file;
 * without, it is the latest record's, which supersedes the earlier ones.
 */
export function buildDueRows(
  people: DuePerson[],
  records: DueRecord[],
  now: Date,
  bookings: DueBooking[] = [],
): DueRow[] {
  const bookedFor = new Map<string, string>();
  for (const b of bookings) {
    const cur = bookedFor.get(b.userId);
    if (!cur || b.on < cur) bookedFor.set(b.userId, b.on);
  }
  const byPerson = new Map<string, DueRecord[]>();
  for (const r of records) {
    const list = byPerson.get(r.userId) ?? [];
    list.push(r);
    byPerson.set(r.userId, list);
  }
  const rows = people.map((person): DueRow => {
    const mine = (byPerson.get(person.id) ?? []).slice().sort((a, b) => b.heldOn.localeCompare(a.heldOn));
    const booked = bookedFor.get(person.id) ?? null;
    if (mine.length === 0) return { person, last: null, next: null, status: "never", booked };
    let next: string | null;
    if (mine.some((r) => r.area)) {
      const latestPerArea = new Map<string, DueRecord>();
      for (const r of mine) if (!latestPerArea.has(r.area ?? "")) latestPerArea.set(r.area ?? "", r);
      next = [...latestPerArea.values()].map((r) => r.nextDue).filter((d): d is string => !!d).sort()[0] ?? null;
    } else {
      next = mine[0].nextDue;
    }
    return { person, last: mine[0].heldOn, next, status: dueStatus(next, now), booked };
  });
  return rows.sort(
    (a, b) =>
      DUE_ORDER.indexOf(a.status) - DUE_ORDER.indexOf(b.status) ||
      (a.next ?? "9999").localeCompare(b.next ?? "9999") ||
      a.person.name.localeCompare(b.person.name),
  );
}
