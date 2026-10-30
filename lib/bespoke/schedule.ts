/**
 * When a bespoke report is emailed, and to whom (BESPOKE-REPORTS.md): weekly
 * on a weekday or monthly on a day from 1 to 28, as a PDF or Excel, to named
 * people. Pure, so the dates and the checks are tested directly.
 */

export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

export const MAX_RECIPIENTS = 20;
/** Scheduled reports go out from this hour, UK time. */
export const SEND_FROM_HOUR = 7;

export interface Recipient {
  name: string;
  email: string;
}

export interface ScheduleInput {
  frequency: "weekly" | "monthly";
  weekday: number | null;
  dayOfMonth: number | null;
  format: "pdf" | "xlsx";
  recipients: Recipient[];
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The first day strictly after `after` that the schedule falls on. */
export function nextSendOn(s: Pick<ScheduleInput, "frequency" | "weekday" | "dayOfMonth">, after: string): string {
  const d = at(after);
  if (s.frequency === "weekly") {
    const want = (s.weekday ?? 1) % 7; // JS: 0 = Sunday
    do d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() !== want);
    return iso(d);
  }
  const day = Math.min(Math.max(s.dayOfMonth ?? 1, 1), 28);
  const thisMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 12));
  if (thisMonth > d) return iso(thisMonth);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day, 12)));
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** "Every Monday, as a PDF", "On the 1st of every month, as Excel". */
export function scheduleLabel(s: Pick<ScheduleInput, "frequency" | "weekday" | "dayOfMonth" | "format">): string {
  const when =
    s.frequency === "weekly"
      ? `Every ${WEEKDAYS.find((w) => w.value === s.weekday)?.label ?? "week"}`
      : `On the ${ordinal(s.dayOfMonth ?? 1)} of every month`;
  return `${when}, as ${s.format === "xlsx" ? "Excel" : "a PDF"}`;
}

/** Recipients from the form's name and email lists, blanks dropped and duplicates merged. */
export function readRecipients(names: string[], emails: string[]): Recipient[] | string {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(names.length, emails.length); i++) {
    const name = (names[i] ?? "").trim().slice(0, 120);
    const email = (emails[i] ?? "").trim().toLowerCase();
    if (!name && !email) continue;
    if (!email) return `Give an email address for ${name}.`;
    if (email.length > 254 || !EMAIL.test(email)) return `${email} doesn't look like an email address.`;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: name || email, email });
  }
  if (out.length === 0) return "Add at least one person to send it to.";
  if (out.length > MAX_RECIPIENTS) return `Send it to ${MAX_RECIPIENTS} people at most.`;
  return out;
}

/** Read and check the schedule form. A string is the error to show. */
export function readSchedule(raw: {
  frequency: string;
  weekday: string;
  dayOfMonth: string;
  format: string;
  names: string[];
  emails: string[];
}): ScheduleInput | string {
  if (raw.frequency !== "weekly" && raw.frequency !== "monthly") return "Choose how often it's sent.";
  const weekday = Number(raw.weekday);
  const dayOfMonth = Number(raw.dayOfMonth);
  if (raw.frequency === "weekly" && !(Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)) return "Choose the day of the week.";
  if (raw.frequency === "monthly" && !(Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 28)) {
    return "Choose a day of the month from 1 to 28.";
  }
  if (raw.format !== "pdf" && raw.format !== "xlsx") return "Choose PDF or Excel.";
  const recipients = readRecipients(raw.names, raw.emails);
  if (typeof recipients === "string") return recipients;
  return {
    frequency: raw.frequency,
    weekday: raw.frequency === "weekly" ? weekday : null,
    dayOfMonth: raw.frequency === "monthly" ? dayOfMonth : null,
    format: raw.format,
    recipients,
  };
}

/** Recipients as stored (jsonb), read defensively. */
export function storedRecipients(v: unknown): Recipient[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) =>
    r && typeof r === "object" && typeof (r as Recipient).email === "string"
      ? [{ name: String((r as Recipient).name ?? (r as Recipient).email), email: (r as Recipient).email }]
      : [],
  );
}

/** The UK hour now, 0–23. */
export function ukHour(now = new Date()): number {
  return Number(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false })) % 24;
}

/**
 * Whether a scheduled send moves the schedule on to its next date. Only once
 * the report has run and at least one email went: a run that failed, or sent
 * nothing, is tried again on the next hourly run. Past its due day it is
 * given up on, so a report that keeps failing doesn't run every hour for
 * ever — each failure is in report_sends for the manager to see.
 */
export function movesScheduleOn(emailsSent: number, dueOn: string, today: string): boolean {
  return emailsSent > 0 || dueOn < today;
}
