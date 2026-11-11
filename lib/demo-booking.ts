/**
 * Demo bookings (TRIAL.md, 6 Nov 2026): once a company has signed up for
 * its free trial it can book a 30-minute demo with us, picking a day and a
 * time from what we offer. Saj confirms it by hand, so a booking is a
 * request until he does.
 *
 * What's offered: 30-minute slots between 9am and 5pm, UK time, on the next
 * DEMO_DAYS_OFFERED working days (never today, so there's always a working
 * day's notice), skipping weekends and bank holidays, every Tuesday from
 * 2pm, and every Thursday from 10:30 to 12:30. A slot someone else already
 * holds is left out.
 *
 * Pure: no Supabase import, so the rules and the emails can be tested
 * without a database or a mailbox, and the chooser can run in the browser.
 * The action that uses them is app/(marketing)/free-trial/actions.ts.
 */

import { esc } from "@/lib/email-layout";
import { UK_TIME_ZONE } from "@/lib/dates";
import { addWorkingDays, isWorkingDay, ukToday } from "@/lib/bespoke/working-days";

export const DEMO_MINUTES = 30;
/** How many working days ahead a demo can be booked. */
export const DEMO_DAYS_OFFERED = 10;
/** The working day, as minutes from midnight UK time: 9am to 5pm. */
const DAY_START = 9 * 60;
const DAY_END = 17 * 60;

/**
 * When we're not free, as minutes from midnight on a weekday (1 = Monday).
 * A slot is out if any part of it falls in a block.
 */
const BLOCKS: { weekday: number; from: number; to: number }[] = [
  { weekday: 2, from: 14 * 60, to: DAY_END }, // Tuesday afternoons
  { weekday: 4, from: 10 * 60 + 30, to: 12 * 60 + 30 }, // Thursday 10:30 to 12:30
];

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

/** The same moment, read as if UK wall-clock time were UTC. */
function ukWallMs(d: Date): number {
  const p = Object.fromEntries(ukParts.formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

/** The moment a UK wall-clock time falls on: "2026-11-10" at 10:00 GMT or BST. */
export function ukInstant(dayKey: string, minutes: number): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // UK time is UTC or one hour ahead; take that offset back off.
  const offset = ukWallMs(new Date(guess)) - guess;
  return new Date(guess - offset);
}

/** 1 = Monday … 7 = Sunday, for an ISO day. */
function weekdayOf(dayKey: string): number {
  const d = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The slot starts we offer on a day, as minutes from midnight; none on a non-working day. */
export function demoSlotMinutes(dayKey: string): number[] {
  if (!isWorkingDay(dayKey)) return [];
  const weekday = weekdayOf(dayKey);
  const out: number[] = [];
  for (let start = DAY_START; start + DEMO_MINUTES <= DAY_END; start += DEMO_MINUTES) {
    const end = start + DEMO_MINUTES;
    const blocked = BLOCKS.some((b) => b.weekday === weekday && start < b.to && end > b.from);
    if (!blocked) out.push(start);
  }
  return out;
}

/** The days a demo can be booked on: the next DEMO_DAYS_OFFERED working days, never today. */
export function demoDays(now: Date = new Date()): string[] {
  const days: string[] = [];
  let day = ukToday(now);
  for (let i = 0; i < DEMO_DAYS_OFFERED; i += 1) {
    day = addWorkingDays(day, 1);
    days.push(day);
  }
  return days;
}

export interface DemoSlot {
  /** The moment it starts, ISO. */
  startsAt: string;
  /** "10:00", UK time. */
  time: string;
}

export interface DemoDay {
  /** "2026-11-10". */
  day: string;
  /** "Tue 10 Nov". */
  label: string;
  slots: DemoSlot[];
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });

/**
 * Everything on offer right now, day by day, less the slots in `taken`
 * (ISO starts of bookings already made). A day with nothing left is still
 * listed, so the chooser can say so rather than skip it.
 */
export function demoSlots(now: Date = new Date(), taken: Iterable<string> = []): DemoDay[] {
  const held = new Set([...taken].map((t) => new Date(t).toISOString()));
  return demoDays(now).map((day) => ({
    day,
    label: dayLabel.format(ukInstant(day, 12 * 60)),
    slots: demoSlotMinutes(day)
      .map((m) => ({ startsAt: ukInstant(day, m).toISOString(), time: hhmm(m) }))
      .filter((s) => !held.has(s.startsAt)),
  }));
}

/** Whether a moment is one of the slots on offer today (the rules, not what's taken). */
export function isOfferedDemoSlot(startsAt: string, now: Date = new Date()): boolean {
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return false;
  const iso = when.toISOString();
  return demoSlots(now).some((d) => d.slots.some((s) => s.startsAt === iso));
}

const whenLabel = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
const timeLabel = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Tuesday 10 November, 10:00 to 10:30". */
export function demoSlotLabel(startsAt: string | Date): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + DEMO_MINUTES * 60_000);
  return `${whenLabel.format(start)}, ${timeLabel.format(start)} to ${timeLabel.format(end)}`;
}

export interface DemoBooking {
  orgId: string | null;
  orgName: string;
  name: string;
  email: string;
  phone: string | null;
  /** ISO start. */
  startsAt: string;
}

function row(label: string, value: string): string {
  return `<tr>
    <th align="left" style="padding:6px 12px 6px 0;vertical-align:top;color:#4f6070;font-weight:600;white-space:nowrap">${esc(label)}</th>
    <td style="padding:6px 0;vertical-align:top">${esc(value)}</td>
  </tr>`;
}

/**
 * To us, the moment a demo is booked: when, who, and a button to the
 * company's platform page. Reply-to is the person, so confirming needs no
 * copy-and-paste.
 */
export function demoBookedNotificationEmail(b: DemoBooking, origin: string): { subject: string; html: string } {
  const when = demoSlotLabel(b.startsAt);
  const rows = [
    row("When", when),
    row("Company", b.orgName),
    row("Name", b.name),
    row("Email", b.email),
    b.phone ? row("Phone", b.phone) : "",
  ]
    .filter(Boolean)
    .join("");
  const button = b.orgId
    ? `<p style="margin-top:24px"><a href="${esc(`${origin}/platform/organisations/${b.orgId}`)}" style="display:inline-block;background:#134f63;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open ${esc(b.orgName)}</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#17222c">
    <h2 style="margin:0 0 4px">${esc(b.orgName)} booked a demo</h2>
    <p style="margin:0 0 20px;color:#4f6070">${esc(when)}, ${DEMO_MINUTES} minutes. They've been told you'll confirm by email.</p>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    ${button}
    <p style="color:#888;font-size:12px;margin-top:24px">My Care Academy — sent by the demo booking on /free-trial.</p>
  </div>`;
  return { subject: `Demo booked — ${b.orgName}, ${when}`, html };
}

/**
 * To them: we've got the booking and will confirm. Says the time back so a
 * wrong one is caught now, and gives the phone number to change it.
 */
export function demoRequestedEmail(b: DemoBooking): { subject: string; html: string } {
  const firstName = b.name.trim().split(/\s+/)[0] || "there";
  const when = demoSlotLabel(b.startsAt);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#17222c">
    <h2 style="margin:0 0 4px">Your demo is booked in</h2>
    <p>Hi ${esc(firstName)},</p>
    <p>Thanks for booking a demo of My Care Academy for <strong>${esc(b.orgName)}</strong>. We've got you down for <strong>${esc(when)}</strong> (UK time), about ${DEMO_MINUTES} minutes.</p>
    <p>We'll confirm by email with how we'll call you. If that time stops suiting you, reply to this email or ring us on <a href="tel:+441614708088" style="color:#0f8178">0161 470 8088</a> and we'll find another.</p>
    <p style="color:#888;font-size:12px;margin-top:24px">My Care Academy · 107 Wellington Road, Stockport, SK4 2LR · 0161 470 8088</p>
  </div>`;
  return { subject: `Your demo: ${when} — My Care Academy`, html };
}
