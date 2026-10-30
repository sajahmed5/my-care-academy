/**
 * Review dates on forms (FORMS.md): risk assessments, care plans and the
 * business continuity plan carry a date they must be reviewed by, and show in
 * Who's due when it comes round.
 *
 * Reviewing is filling the form in again from the last answers, so the record
 * that counts is the latest one for a form and what it is about — a client,
 * the company, or (for a carer form) a member of staff. An older record's
 * date stops mattering the moment a newer one is filed.
 *
 * Pure: the pages read the rows, this decides what is due.
 */

import { dueStatus, type DueStatus } from "./records";
import type { FormAudience } from "./form-library";

/** A plain date a number of months on, clamped to the month's end (31 Jan + 1 → 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Today in the UK, as a plain date. */
export function ukToday(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** The review date a form starts with: its period on from today, or none. */
export function defaultReviewDue(now: Date, months: number | null | undefined): string | null {
  return months ? addMonths(ukToday(now), months) : null;
}

/**
 * The review date as typed: a real date, from today to five years on, or
 * none. Anything else is dropped rather than refusing the whole form.
 */
export function cleanReviewDue(raw: unknown, now: Date): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  const today = ukToday(now);
  if (raw < today || raw > addMonths(today, 60)) return null;
  return raw;
}

export interface ReviewRecord {
  id: string;
  templateId: string;
  templateCode: string;
  templateTitle: string;
  subject: FormAudience;
  clientId: string | null;
  clientName: string | null;
  userId: string;
  userName: string;
  submittedAt: string;
  reviewDue: string | null;
}

export interface ReviewRow extends ReviewRecord {
  status: Exclude<DueStatus, "none">;
}

function keyOf(r: ReviewRecord): string {
  const about = r.subject === "client" ? r.clientId ?? `gone:${r.id}` : r.subject === "carer" ? r.userId : "company";
  return `${r.templateId}|${r.subject}|${about}`;
}

/**
 * The latest record for each form and what it is about, kept when it has a
 * review date, soonest first. A client removed from the list has nobody to
 * review, so their records drop out.
 */
export function reviewRows(records: ReviewRecord[], now: Date): ReviewRow[] {
  const latest = new Map<string, ReviewRecord>();
  for (const r of records) {
    if (r.subject === "client" && !r.clientId) continue;
    const k = keyOf(r);
    const cur = latest.get(k);
    if (!cur || r.submittedAt > cur.submittedAt) latest.set(k, r);
  }
  return [...latest.values()]
    .filter((r): r is ReviewRecord & { reviewDue: string } => !!r.reviewDue)
    .map((r) => ({ ...r, status: dueStatus(`${r.reviewDue}T23:59:59Z`, now) as ReviewRow["status"] }))
    .sort((a, b) => a.reviewDue!.localeCompare(b.reviewDue!));
}

/** Where a review is done: the form again, from these answers — or, for a carer form, ask again. */
export function reviewHref(r: Pick<ReviewRecord, "id" | "templateCode" | "subject" | "clientId">): string {
  const code = encodeURIComponent(r.templateCode);
  if (r.subject === "carer") return `/org/forms/library/${code}`;
  const client = r.clientId ? `client=${encodeURIComponent(r.clientId)}&` : "";
  return `/org/forms/fill/${code}?${client}review=${r.id}`;
}
