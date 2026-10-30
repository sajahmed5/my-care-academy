/**
 * Working days, for the 10-working-day promise on a bespoke report
 * (BESPOKE-REPORTS.md). Weekends and the bank holidays in England and Wales
 * are skipped — we're in Stockport, and a promise that counted Christmas Day
 * would be one we broke every December.
 *
 * Bank holidays are worked out from the rules rather than listed, so the
 * promise doesn't quietly stop skipping them the year a list runs out. A
 * one-off (a coronation, a jubilee) isn't covered; add it to EXTRA_HOLIDAYS
 * when it's announced.
 *
 * Every date here is an ISO day ("2026-10-30"), worked on at noon UTC so no
 * timezone can move it.
 */

export const REPORT_WORKING_DAYS = 10;

/** One-off bank holidays announced on top of the usual ones. */
const EXTRA_HOLIDAYS: string[] = [];

const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));

/** Easter Sunday (anonymous Gregorian algorithm). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** The first given weekday (0 = Sunday) of a month. */
function firstWeekday(year: number, month: number, weekday: number): Date {
  const d = ymd(year, month, 1);
  return plus(d, (weekday - d.getUTCDay() + 7) % 7);
}

/** The last given weekday of a month. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const d = ymd(year, month + 1, 0);
  return plus(d, -((d.getUTCDay() - weekday + 7) % 7));
}

/** The bank holidays in England and Wales for one year, as ISO days. */
export function bankHolidays(year: number): string[] {
  const days: Date[] = [];

  // New Year's Day, moved to the Monday when it falls at a weekend.
  const newYear = ymd(year, 1, 1);
  const ny = newYear.getUTCDay();
  days.push(ny === 6 ? plus(newYear, 2) : ny === 0 ? plus(newYear, 1) : newYear);

  const sunday = easter(year);
  days.push(plus(sunday, -2), plus(sunday, 1));

  days.push(firstWeekday(year, 5, 1), lastWeekday(year, 5, 1), lastWeekday(year, 8, 1));

  // Christmas and Boxing Day, each moved on to the next free weekday.
  const christmas = ymd(year, 12, 25);
  switch (christmas.getUTCDay()) {
    case 5: // Friday: Boxing Day on Saturday moves to Monday.
      days.push(christmas, plus(christmas, 3));
      break;
    case 6: // Saturday: Monday and Tuesday.
      days.push(plus(christmas, 2), plus(christmas, 3));
      break;
    case 0: // Sunday: Boxing Day Monday, Christmas Tuesday.
      days.push(plus(christmas, 1), plus(christmas, 2));
      break;
    default:
      days.push(christmas, plus(christmas, 1));
  }

  return [...days.map(iso), ...EXTRA_HOLIDAYS.filter((d) => d.startsWith(`${year}-`))].sort();
}

const holidayCache = new Map<number, Set<string>>();
function isHoliday(day: string): boolean {
  const year = Number(day.slice(0, 4));
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(bankHolidays(year));
    holidayCache.set(year, set);
  }
  return set.has(day);
}

/** Monday to Friday and not a bank holiday. */
export function isWorkingDay(day: string): boolean {
  const d = at(day).getUTCDay();
  return d !== 0 && d !== 6 && !isHoliday(day.slice(0, 10));
}

/** The day `count` working days after `from` — the day asked is never one of them. */
export function addWorkingDays(from: string, count: number): string {
  let d = at(from);
  let left = count;
  while (left > 0) {
    d = plus(d, 1);
    if (isWorkingDay(iso(d))) left -= 1;
  }
  return iso(d);
}

/**
 * Working days from `today` until `due`: 0 on the day itself, negative once
 * it has passed (counting the working days late).
 */
export function workingDaysLeft(today: string, due: string): number {
  const a = today.slice(0, 10);
  const b = due.slice(0, 10);
  if (a === b) return 0;
  const forward = a < b;
  let d = at(a);
  let n = 0;
  while (iso(d) !== b) {
    d = plus(d, forward ? 1 : -1);
    if (isWorkingDay(iso(d))) n += 1;
  }
  return forward ? n : -n;
}

/** The date a request asked on `askedOn` is due: ten working days later. */
export function reportDueOn(askedOn: string): string {
  return addWorkingDays(askedOn, REPORT_WORKING_DAYS);
}

/** "Today" as an ISO day in UK time. */
export function ukToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
