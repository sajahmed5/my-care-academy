/**
 * Policies in the weekly email, on the Policies due page and in the daily
 * reminders (POLICIES.md): reviews overdue and falling due in the next 30
 * days, and people late accepting. The same dueStatus() the other Who's due
 * lists use, and the same buildReading() as the pages, so the email and the
 * pages never disagree.
 *
 * Pure: the callers read the rows, this decides what they say.
 */

import { dueStatus, type DueStatus } from "./records";
import { esc } from "./email-layout";
import { formatDate } from "./dates";
import type { ReadingEntry } from "./policy-reading";

export interface PolicyReviewRow {
  copyId: string;
  title: string;
  code: string;
  reviewDueOn: string | null;
}

export interface PolicyReviewDue extends PolicyReviewRow {
  status: DueStatus;
}

/** Each published policy with where its review stands, soonest first. */
export function reviewsDue(rows: PolicyReviewRow[], now: Date): PolicyReviewDue[] {
  return rows
    .map((r) => ({ ...r, status: dueStatus(r.reviewDueOn, now) }))
    .sort((a, b) => (a.reviewDueOn ?? "9999").localeCompare(b.reviewDueOn ?? "9999") || a.title.localeCompare(b.title));
}

export interface PolicyDigest {
  reviewsOverdue: number;
  reviewsDueSoon: number;
  /** Acceptances past their deadline, and how many people they belong to. */
  lateAcceptances: number;
  latePeople: number;
}

export function policyDigest(rows: PolicyReviewRow[], now: Date, reading: ReadingEntry[] = []): PolicyDigest {
  const due = reviewsDue(rows, now);
  const late = reading.filter((e) => e.status === "late");
  return {
    reviewsOverdue: due.filter((r) => r.status === "overdue").length,
    reviewsDueSoon: due.filter((r) => r.status === "due_soon").length,
    lateAcceptances: late.length,
    latePeople: new Set(late.map((e) => e.userId)).size,
  };
}

/** The section of the weekly email, or "" when there is nothing to say. */
export function policyDigestHtml(d: PolicyDigest | undefined, origin: string): string {
  if (!d) return "";
  const said = [
    d.reviewsOverdue ? `${d.reviewsOverdue} overdue` : null,
    d.reviewsDueSoon ? `${d.reviewsDueSoon} due in the next 30 days` : null,
  ].filter(Boolean);
  const items: string[] = [];
  const href = esc(origin + "/org/due/policies");
  if (d.lateAcceptances) {
    items.push(
      `<li><a href="${href}">Late accepting a policy</a>: ${d.latePeople} ${d.latePeople === 1 ? "person" : "people"}, ${d.lateAcceptances} ${d.lateAcceptances === 1 ? "policy" : "policies"} between them</li>`,
    );
  }
  if (said.length) items.push(`<li><a href="${href}">Policy reviews</a>: ${said.join(", ")}</li>`);
  if (items.length === 0) return "";
  return `<p style="margin-top:20px"><strong>Policies</strong></p><ul>${items.join("")}</ul>`;
}

/** One person's reminder: every policy they still have to accept, soonest first. */
export function policyReminderEmail(
  name: string,
  organisationName: string,
  items: { title: string; dueOn: string; late: boolean }[],
  origin: string,
): { subject: string; html: string } {
  const sorted = [...items].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const anyLate = sorted.some((i) => i.late);
  const list = sorted
    .map(
      (i) =>
        `<li>${esc(i.title)} — ${i.late ? "<strong>overdue</strong>, was due" : "by"} ${esc(formatDate(i.dueOn, { day: "numeric", month: "long" }))}</li>`,
    )
    .join("");
  return {
    subject: anyLate
      ? `Overdue: ${sorted.length === 1 ? "a policy" : "policies"} to read for ${organisationName}`
      : `${sorted.length === 1 ? "A policy" : "Policies"} to read for ${organisationName}`,
    html: `<p>Hello ${esc(name)},</p>
<p>${esc(organisationName)} has asked you to read and accept ${sorted.length === 1 ? "this policy" : "these policies"}:</p>
<ul>${list}</ul>
<p><a href="${esc(origin + "/learn/policies")}">Read them now</a> — it only takes a few minutes, and your acceptance is recorded with the date.</p>`,
  };
}
