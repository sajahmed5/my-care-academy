/**
 * Policies in the weekly email and on the Policies due page (POLICIES.md):
 * reviews overdue and falling due in the next 30 days. The same dueStatus()
 * the other Who's due lists use, so the email and the page never disagree.
 *
 * Pure: the callers read the rows, this decides what they say.
 */

import { dueStatus, type DueStatus } from "./records";
import { esc } from "./email-layout";

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
}

export function policyDigest(rows: PolicyReviewRow[], now: Date): PolicyDigest {
  const due = reviewsDue(rows, now);
  return {
    reviewsOverdue: due.filter((r) => r.status === "overdue").length,
    reviewsDueSoon: due.filter((r) => r.status === "due_soon").length,
  };
}

/** The section of the weekly email, or "" when there is nothing to say. */
export function policyDigestHtml(d: PolicyDigest | undefined, origin: string): string {
  if (!d) return "";
  const said = [
    d.reviewsOverdue ? `${d.reviewsOverdue} overdue` : null,
    d.reviewsDueSoon ? `${d.reviewsDueSoon} due in the next 30 days` : null,
  ].filter(Boolean);
  if (said.length === 0) return "";
  return `<p style="margin-top:20px"><strong>Policies</strong></p><ul><li><a href="${esc(origin + "/org/due/policies")}">Policy reviews</a>: ${said.join(", ")}</li></ul>`;
}
