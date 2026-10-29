import { UK_TIME_ZONE, formatDate, formatDateTime } from "./dates";

/**
 * Face-to-face training at our office (FACE-TO-FACE.md, agreed 29 Oct 2026).
 *
 * Sessions are ours: we set them up, Enterprise companies book named staff
 * onto them, and our trainer takes the register. Pure helpers only — no
 * Supabase — so the rules (titles, UK times, the 48-hour cancel line) can be
 * tested and used on both sides of a render.
 */

export const OFFICE_ADDRESS = "Unit A1, The Embankment, Vale Road, Stockport, SK4 3GN";

export type SessionKind = "course" | "induction" | "refresher";

export const KIND_LABEL: Record<Exclude<SessionKind, "course">, string> = {
  induction: "Induction training",
  refresher: "Annual refresher training",
};

/** Cancel up to 48 hours before; after that a place that isn't used is a no-show. */
export const CANCEL_NOTICE_HOURS = 48;

/** What a session is called: the course's title, or induction / refresher. */
export function sessionTitle(kind: string, courseTitle: string | null | undefined): string {
  if (kind === "induction" || kind === "refresher") return KIND_LABEL[kind];
  return courseTitle || "Training session";
}

/** The parts of an instant as a London wall clock. */
function londonParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/**
 * A UK date and time, as typed into the form ("2026-11-05", "09:30"), to the
 * instant it means. The server runs in UTC, so 9:30 in summer is 08:30Z; the
 * offset is read from the London clock rather than assumed.
 */
export function ukLocalToDate(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, m, d, h, min] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (h > 23 || min > 59) return null;
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Guess the wall clock is UTC, see what London says it is, and correct.
  let at = wall;
  for (let i = 0; i < 2; i++) {
    const p = londonParts(new Date(at));
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    at += wall - seen;
  }
  const check = londonParts(new Date(at));
  if (check.y !== y || check.m !== m || check.d !== d) return null;
  return new Date(at);
}

/** The UK calendar day of an instant, "2026-11-05". */
export function ukDay(at: string | Date): string {
  const p = londonParts(new Date(at));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The UK wall-clock time of an instant, "09:30". */
export function ukTime(at: string | Date): string {
  return formatDateTime(at, { hour: "2-digit", minute: "2-digit" });
}

/** "Thursday 5 November 2026" — a session's day, written out. */
export function sessionDay(startsAt: string): string {
  const weekday = formatDate(startsAt, { weekday: "long" });
  return `${weekday} ${formatDate(startsAt, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** "Thursday 5 November 2026, 09:30 to 12:30" — how a session's time is written. */
export function sessionWhen(startsAt: string, endsAt: string): string {
  return `${sessionDay(startsAt)}, ${ukTime(startsAt)} to ${ukTime(endsAt)}`;
}

/** Whether a booking can still be cancelled: 48 hours or more before it starts. */
export function canCancelBooking(startsAt: string | Date, now: Date = new Date()): boolean {
  return new Date(startsAt).getTime() - now.getTime() >= CANCEL_NOTICE_HOURS * 3600_000;
}

/** The day after a UK day, "2026-11-05" → "2026-11-06". */
export function nextUkDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}
