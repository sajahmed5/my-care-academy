/**
 * The pure half of the scheduled jobs: deciding who gets an email and what it
 * says. Kept apart from the database code in lib/engine so it can be tested
 * without one.
 *
 * The rule this module exists for: **one email per person per run**. The jobs
 * used to send one email per course — so a carer with 16 unstarted courses got
 * 16 emails in a single morning, and a manager got one for every carer whose
 * certificate was lapsing. Now each person gets one message listing
 * everything that applies to them.
 */

import { emailButton, emailLayout, esc } from "./email-layout";
import { daysSince } from "@/lib/engine-logic";
import { formatDate } from "./dates";

/** Split an array into runs of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Escape text going into email HTML — names and titles are user-entered. */
export { esc };

const fmtDate = (d: string | Date) =>
  formatDate(d, { day: "numeric", month: "long", year: "numeric" });

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function wrap(title: string, body: string): string {
  return emailLayout({ heading: title, body });
}

// ---------------------------------------------------------------- reminders

/** One unfinished enrolment that is eligible for a reminder. */
export interface ReminderItem {
  enrolmentId: string;
  userId: string;
  courseTitle: string;
  dueDate: string | null;
  overdue: boolean;
  lastReminderAt: string | null;
}

export interface ReminderPlan {
  userId: string;
  /** Every outstanding course for this person, overdue first. */
  items: ReminderItem[];
  /** All of them get last_reminder_at reset, so the set moves together. */
  enrolmentIds: string[];
}

/**
 * Who gets a reminder this run, and what goes in it.
 *
 * A person is included if ANY of their outstanding courses hasn't been
 * reminded about for `repeatDays`. When they are, the email lists ALL their
 * outstanding courses — not just the ones that tripped the timer — and every
 * one is marked reminded. That keeps each person on a single cycle: one email,
 * then quiet until the next one is due.
 */
export function planReminders(
  items: ReminderItem[],
  repeatDays: number,
  now: Date,
): ReminderPlan[] {
  const byUser = new Map<string, ReminderItem[]>();
  for (const item of items) {
    const list = byUser.get(item.userId) ?? [];
    list.push(item);
    byUser.set(item.userId, list);
  }

  const plans: ReminderPlan[] = [];
  for (const [userId, list] of byUser) {
    const anyDue = list.some(
      (i) =>
        daysSince(i.lastReminderAt ? new Date(i.lastReminderAt) : null, now) >=
        repeatDays,
    );
    if (!anyDue) continue;
    const sorted = [...list].sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        a.courseTitle.localeCompare(b.courseTitle),
    );
    plans.push({ userId, items: sorted, enrolmentIds: sorted.map((i) => i.enrolmentId) });
  }
  return plans;
}

export function reminderEmail(
  name: string,
  items: ReminderItem[],
  origin: string,
): { subject: string; html: string } {
  const overdue = items.filter((i) => i.overdue).length;
  const subject =
    overdue > 0
      ? `You have ${overdue} overdue ${plural(overdue, "course")}`
      : `${items.length} ${plural(items.length, "course")} to complete`;

  const rows = items
    .map((i) => {
      const when = i.overdue
        ? `<span style="color:#c0392b;font-weight:600">Overdue${i.dueDate ? ` — was due ${fmtDate(i.dueDate)}` : ""}</span>`
        : i.dueDate
          ? `Due ${fmtDate(i.dueDate)}`
          : "No due date";
      return `<li style="margin:0 0 8px"><strong>${esc(i.courseTitle)}</strong><br><span style="font-size:14px;color:#587070">${when}</span></li>`;
    })
    .join("");

  const html = wrap(
    overdue > 0 ? "Training overdue" : "Training to complete",
    `<p>Hi ${esc(name)},</p>
     <p>You have ${items.length} ${plural(items.length, "course")} to complete on My Care Academy:</p>
     <ul style="padding-left:18px">${rows}</ul>
     ${emailButton(`${origin}/learn`, "Continue your training")}`,
  );
  return { subject, html };
}

// ---------------------------------------------------------------- renewals

/** A certificate that lapsed this run, or reached a renewal window. */
export interface RenewalNotice {
  learnerName: string;
  courseTitle: string;
  kind: "expired" | "due";
  expiresAt: string;
  /** For "due": the window reached (60, 30, 7). */
  withinDays?: number;
}

function noticeLine(n: RenewalNotice, withName: boolean): string {
  const who = withName ? `${esc(n.learnerName)} — ` : "";
  const what =
    n.kind === "expired"
      ? `<span style="color:#c0392b;font-weight:600">expired ${fmtDate(n.expiresAt)}</span> — needs retaking`
      : `expires ${fmtDate(n.expiresAt)} (within ${n.withinDays} days)`;
  return `<li style="margin:0 0 8px">${who}<strong>${esc(n.courseTitle)}</strong><br><span style="font-size:14px;color:#587070">${what}</span></li>`;
}

/** The learner's own renewal email — every certificate of theirs that needs attention. */
export function renewalLearnerEmail(
  name: string,
  notices: RenewalNotice[],
  origin: string,
): { subject: string; html: string } {
  const expiredList = notices.filter((n) => n.kind === "expired");
  const expired = expiredList.length;
  // Name the course when there's only one — "Your Fire Safety certificate has
  // expired" says more than a count of one.
  const subject =
    expired === 1
      ? `Your ${expiredList[0].courseTitle} certificate has expired`
      : expired > 1
        ? `${expired} of your certificates have expired`
        : notices.length === 1
          ? `Your ${notices[0].courseTitle} certificate is due for renewal`
          : `${notices.length} of your certificates are due for renewal`;
  const html = wrap(
    expired > 0 ? "Training required again" : "Renewal approaching",
    `<p>Hi ${esc(name)},</p>
     <p>${expired > 0 ? "Some of your training needs to be retaken to stay compliant:" : "Some of your certificates are coming up for renewal:"}</p>
     <ul style="padding-left:18px">${notices.map((n) => noticeLine(n, false)).join("")}</ul>
     ${emailButton(`${origin}/learn`, "Go to my training")}`,
  );
  return { subject, html };
}

/**
 * The manager's summary — every certificate in the organisation that needs
 * attention this run, in one email rather than one per carer.
 */
export function renewalOrgEmail(
  orgName: string,
  notices: RenewalNotice[],
  origin: string,
): { subject: string; html: string } {
  const expired = notices.filter((n) => n.kind === "expired").length;
  const due = notices.length - expired;
  const parts = [
    expired ? `${expired} expired` : "",
    due ? `${due} due for renewal` : "",
  ].filter(Boolean);
  const sorted = [...notices].sort(
    (a, b) =>
      Number(b.kind === "expired") - Number(a.kind === "expired") ||
      a.expiresAt.localeCompare(b.expiresAt),
  );
  const html = wrap(
    `Certificates — ${esc(orgName)}`,
    `<p>${parts.join(", ")}:</p>
     <ul style="padding-left:18px">${sorted.map((n) => noticeLine(n, true)).join("")}</ul>
     ${emailButton(`${origin}/org/certificates`, "Open certificates")}`,
  );
  return { subject: `Certificates: ${parts.join(", ")} — ${orgName}`, html };
}
