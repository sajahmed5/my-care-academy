/**
 * The two audits that fill themselves in (SERVICE-AUDITS.md, Service-wide
 * audits): the staff file audit, from the HR pack — DBS and right to work in
 * date, references held, probation done — and the training audit, from the
 * training records. The site finds what it can; the auditor checks it and
 * signs it off. What was found is kept with the audit as it was on the day.
 *
 * Pure: the loaders read the rows, this decides what each check says.
 */

import { addMonths } from "./records";
import { staffDocState, type StaffDoc } from "./staff-documents";
import { formatDate } from "./dates";

export type AutoKind = "staff_file" | "training";
export type AutoResult = "pass" | "fail" | "na";

export interface AutoCheckResult {
  result: AutoResult;
  detail: string;
}

export interface AutoPerson {
  id: string;
  name: string;
  checks: Record<string, AutoCheckResult>;
}

export interface AutoSnapshot {
  kind: AutoKind;
  checks: { key: string; label: string }[];
  people: AutoPerson[];
  /** For the training audit: courses completed and in date, of those assigned. */
  summary?: { assigned: number; completed: number; overdue: number; expired: number };
}

export const STAFF_FILE_CHECKS = [
  { key: "dbs", label: "DBS in date" },
  { key: "right_to_work", label: "Right to work in date" },
  { key: "references", label: "References held" },
  { key: "probation", label: "Probation done" },
];

export const TRAINING_CHECKS = [{ key: "training", label: "Training up to date" }];

/** A new starter's probation: reviewed within this many months of joining, unless the company's contract says otherwise. */
export const PROBATION_MONTHS = 6;

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

function docCheck(doc: StaffDoc | undefined, now: Date, tracksExpiry: boolean): AutoCheckResult {
  const state = staffDocState(doc, now);
  if (state === "missing") return { result: "fail", detail: "Not on file" };
  if (state === "not_required") return { result: "na", detail: doc?.not_required_reason ? `Not needed: ${doc.not_required_reason}` : "Not needed" };
  if (state === "expired") return { result: "fail", detail: `Expired ${fmt(doc!.expires_at!)}` };
  if (state === "expiring") return { result: "pass", detail: `Expires ${fmt(doc!.expires_at!)} — renew soon` };
  return { result: "pass", detail: tracksExpiry && doc?.expires_at ? `Until ${fmt(doc.expires_at)}` : "Held" };
}

/**
 * Each member of staff's file. Probation is done once a probation review is
 * recorded; before PROBATION_MONTHS from joining it isn't due yet.
 */
export function buildStaffFileSnapshot(
  people: { id: string; name: string; joinedOn: string }[],
  docs: (StaffDoc & { user_id: string })[],
  probationReviews: { user_id: string; held_on: string }[],
  now: Date,
): AutoSnapshot {
  const today = now.toISOString().slice(0, 10);
  return {
    kind: "staff_file",
    checks: STAFF_FILE_CHECKS,
    people: people.map((p) => {
      const mine = new Map(docs.filter((d) => d.user_id === p.id).map((d) => [d.doc_type, d]));
      const reviews = probationReviews.filter((r) => r.user_id === p.id).sort((a, b) => b.held_on.localeCompare(a.held_on));
      const dueBy = addMonths(p.joinedOn, PROBATION_MONTHS);
      const probation: AutoCheckResult = reviews.length
        ? { result: "pass", detail: `Reviewed ${fmt(reviews[0].held_on)}` }
        : dueBy > today
          ? { result: "na", detail: `Not due until ${fmt(dueBy)}` }
          : { result: "fail", detail: "No probation review recorded" };
      return {
        id: p.id,
        name: p.name,
        checks: {
          dbs: docCheck(mine.get("dbs"), now, true),
          right_to_work: docCheck(mine.get("right_to_work"), now, true),
          references: docCheck(mine.get("references"), now, false),
          probation,
        },
      };
    }),
  };
}

/**
 * Each member of staff's training, from the same rollup as the dashboard: up
 * to date when they have training and none of it is overdue or expired.
 */
export function buildTrainingSnapshot(
  rows: { id: string; name: string; assigned: number; completed: number; overdue: number; expired: number }[],
): AutoSnapshot {
  const summary = { assigned: 0, completed: 0, overdue: 0, expired: 0 };
  const people = rows.map((r): AutoPerson => {
    summary.assigned += r.assigned;
    summary.completed += r.completed;
    summary.overdue += r.overdue;
    summary.expired += r.expired;
    let check: AutoCheckResult;
    if (r.assigned === 0) check = { result: "fail", detail: "No training assigned" };
    else if (r.overdue || r.expired) {
      const parts = [r.overdue ? `${r.overdue} overdue` : "", r.expired ? `${r.expired} expired` : ""].filter(Boolean);
      check = { result: "fail", detail: `${parts.join(", ")} · ${r.completed} of ${r.assigned} done` };
    } else check = { result: "pass", detail: `${r.completed} of ${r.assigned} done` };
    return { id: r.id, name: r.name, checks: { training: check } };
  });
  return { kind: "training", checks: TRAINING_CHECKS, people, summary };
}

/** How many checks passed and failed; "na" counts as neither. */
export function autoTally(s: AutoSnapshot | null): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;
  for (const p of s?.people ?? []) {
    for (const c of Object.values(p.checks)) {
      if (c.result === "pass") pass += 1;
      else if (c.result === "fail") fail += 1;
    }
  }
  return { pass, fail };
}

/** The people with something to put right, and what. */
export function autoFindings(s: AutoSnapshot | null): { person: AutoPerson; failing: string[] }[] {
  if (!s) return [];
  return s.people.flatMap((person) => {
    const failing = s.checks.filter((c) => person.checks[c.key]?.result === "fail").map((c) => `${c.label}: ${person.checks[c.key].detail}`);
    return failing.length ? [{ person, failing }] : [];
  });
}

/** Training compliance as one figure: courses completed and in date, of those assigned. */
export function trainingCompliance(summary: AutoSnapshot["summary"]): number | null {
  if (!summary || summary.assigned === 0) return null;
  return Math.round((summary.completed / summary.assigned) * 100);
}

/**
 * The audit's score: the automatic checks and the scored questions together,
 * each check or question counting once.
 */
export function combinedScore(auto: { pass: number; fail: number }, items: { met: number; total: number }): number | null {
  const total = auto.pass + auto.fail + items.total;
  if (total === 0) return null;
  return Math.round(((auto.pass + items.met) / total) * 100);
}
