/**
 * The monthly governance report (SERVICE-AUDITS.md): one document for CQC's
 * well-led question — audits done and their scores, QA ratings by heading,
 * actions still open, concerns, Staff Audits and training compliance — for
 * one month, worked out from what is recorded. An optional summary at the top
 * is the one part a person writes (AI can draft it, from the figures only).
 *
 * Pure: lib/governance-data.ts reads the rows, this shapes them.
 */

import { QA_HEADINGS, type QaHeading } from "./client-qa";

export interface MonthRange {
  /** "2026-10" */
  month: string;
  /** First and last day, inclusive. */
  start: string;
  end: string;
  label: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A month as "YYYY-MM", or null when it isn't one. */
export function monthRange(month: string): MonthRange | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { month, start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}`, label: `${MONTHS[mo - 1]} ${y}` };
}

/** The month before this one: the report a manager usually wants at the start of a month. */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/** The last `count` months, newest first, for the picker. */
export function recentMonths(now: Date, count = 12): MonthRange[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return monthRange(d.toISOString().slice(0, 7))!;
  });
}

const inMonth = (date: string | null | undefined, r: MonthRange) => !!date && date.slice(0, 10) >= r.start && date.slice(0, 10) <= r.end;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export interface AuditSummary {
  done: { title: string; about: string | null; heldOn: string; score: number | null; review: string }[];
  byForm: { title: string; count: number; average: number | null }[];
  waitingReview: number;
  /** Audits behind now, from the due lists. */
  behind: { title: string; count: number }[];
}

export function summariseAudits(
  rows: { title: string; about: string | null; held_on: string; score: number | null; review_status: string }[],
  r: MonthRange,
  behind: { title: string; count: number }[],
): AuditSummary {
  const done = rows
    .filter((a) => inMonth(a.held_on, r))
    .map((a) => ({ title: a.title, about: a.about, heldOn: a.held_on, score: a.score, review: a.review_status }))
    .sort((a, b) => a.heldOn.localeCompare(b.heldOn));
  const titles = [...new Set(done.map((d) => d.title))].sort();
  return {
    done,
    byForm: titles.map((title) => {
      const mine = done.filter((d) => d.title === title);
      return { title, count: mine.length, average: avg(mine.map((d) => d.score).filter((s): s is number => s !== null)) };
    }),
    waitingReview: rows.filter((a) => a.review_status === "waiting").length,
    behind: behind.filter((b) => b.count > 0),
  };
}

export interface QaSummary {
  done: number;
  attempted: number;
  averages: Record<QaHeading, number | null>;
  score: number | null;
  /** QAs below the review level this month. */
  low: { client: string; heldOn: string; score: number }[];
}

export function summariseQas(
  rows: ({ client_name: string; held_on: string; completed: boolean; score: number | null } & Partial<Record<QaHeading, number | null>>)[],
  r: MonthRange,
  reviewBelow: number,
): QaSummary {
  const month = rows.filter((q) => inMonth(q.held_on, r));
  const done = month.filter((q) => q.completed);
  const averages = Object.fromEntries(
    QA_HEADINGS.map((h) => {
      const v = done.map((q) => q[h.key]).filter((x): x is number => typeof x === "number");
      return [h.key, v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null];
    }),
  ) as Record<QaHeading, number | null>;
  return {
    done: done.length,
    attempted: month.length - done.length,
    averages,
    score: avg(done.map((q) => q.score).filter((s): s is number => s !== null)),
    low: done
      .filter((q) => q.score !== null && q.score < reviewBelow)
      .map((q) => ({ client: q.client_name, heldOn: q.held_on, score: q.score! }))
      .sort((a, b) => a.score - b.score),
  };
}

export const ACTION_SOURCE: Record<string, string> = {
  audit: "Audits",
  client_qa: "Client QAs",
  spot_check: "Spot checks",
  supervision: "Supervisions",
  competency: "Competency",
  complaint: "Concerns",
  manual: "Added by a manager",
};

export interface ActionSummary {
  open: number;
  overdue: number;
  bySource: { label: string; open: number; overdue: number }[];
  overdueList: { title: string; owner: string; due: string }[];
}

/** Every action still open at the end of the month, by where it came from. */
export function summariseActions(
  rows: { title: string; owner: string; due_date: string | null; source_type: string; created_at: string; completed_at: string | null }[],
  r: MonthRange,
): ActionSummary {
  // Open at the end of the month: made by then, and not done by then.
  const open = rows.filter((a) => a.created_at.slice(0, 10) <= r.end && (!a.completed_at || a.completed_at.slice(0, 10) > r.end));
  const late = open.filter((a) => a.due_date && a.due_date < r.end);
  const sources = [...new Set(open.map((a) => a.source_type))];
  return {
    open: open.length,
    overdue: late.length,
    bySource: sources
      .map((s) => ({
        label: ACTION_SOURCE[s] ?? "Other",
        open: open.filter((a) => a.source_type === s).length,
        overdue: late.filter((a) => a.source_type === s).length,
      }))
      .sort((a, b) => b.open - a.open),
    overdueList: late
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
      .slice(0, 25)
      .map((a) => ({ title: a.title, owner: a.owner, due: a.due_date! })),
  };
}

export interface ConcernSummary {
  raised: number;
  byKind: { label: string; count: number }[];
  safeguarding: number;
  closed: number;
  openNow: number;
  compliments: number;
}

export function summariseConcerns(
  rows: { kind: string; kindLabel: string; reported_on: string; closed_on: string | null; status: string }[],
  compliments: { received_on: string }[],
  r: MonthRange,
): ConcernSummary {
  const raised = rows.filter((c) => inMonth(c.reported_on, r));
  const labels = [...new Set(raised.map((c) => c.kindLabel))];
  return {
    raised: raised.length,
    byKind: labels.map((label) => ({ label, count: raised.filter((c) => c.kindLabel === label).length })).sort((a, b) => b.count - a.count),
    safeguarding: raised.filter((c) => c.kind === "safeguarding").length,
    closed: rows.filter((c) => inMonth(c.closed_on, r)).length,
    openNow: rows.filter((c) => c.status === "open").length,
    compliments: compliments.filter((c) => inMonth(c.received_on, r)).length,
  };
}

export interface StaffAuditSummary {
  supervisions: number;
  appraisals: number;
  spotChecks: number;
  spotChecksShort: number;
  supervisionsBehind: number;
  spotChecksBehind: number;
}

export interface TrainingSummary {
  compliance: number | null;
  people: number;
  upToDate: number;
  behind: { name: string; detail: string }[];
}

export interface GovernanceReport {
  organisationName: string;
  range: MonthRange;
  reviewBelow: number;
  summary: string;
  audits: AuditSummary;
  qas: QaSummary;
  actions: ActionSummary;
  concerns: ConcernSummary | null;
  staffAudits: StaffAuditSummary | null;
  training: TrainingSummary;
}

export const GOVERNANCE_SUMMARY_SCHEMA = {
  type: "object",
  properties: { paragraphs: { type: "array", items: { type: "string" } } },
  required: ["paragraphs"],
  additionalProperties: false,
} as const;

/**
 * What Claude is asked: the month's figures only — no names of clients or
 * staff, which it doesn't need to write a summary and shouldn't be sent.
 */
export function governancePrompt(g: GovernanceReport): string {
  const lines: string[] = [];
  const add = (s: string) => lines.push(s);
  add(`Company: ${g.organisationName}. Month: ${g.range.label}. Manager-review level: ${g.reviewBelow}%.`);
  add(`Audits carried out: ${g.audits.done.length}. ${g.audits.byForm.map((f) => `${f.title}: ${f.count}${f.average !== null ? `, average ${f.average}%` : ""}`).join("; ") || "none"}.`);
  add(`Audits and QAs waiting for a manager's review now: ${g.audits.waitingReview}.`);
  if (g.audits.behind.length) add(`Audits behind schedule now: ${g.audits.behind.map((b) => `${b.title} ${b.count}`).join("; ")}.`);
  add(
    `Client QAs done: ${g.qas.done}, attempted but not done: ${g.qas.attempted}. Average ratings out of 10: ${QA_HEADINGS.map((h) => `${h.label} ${g.qas.averages[h.key] ?? "n/a"}`).join(", ")}. QAs below the review level: ${g.qas.low.length}.`,
  );
  add(`Actions open at month end: ${g.actions.open}, of which overdue: ${g.actions.overdue}. By source: ${g.actions.bySource.map((s) => `${s.label} ${s.open} (${s.overdue} overdue)`).join("; ") || "none"}.`);
  if (g.concerns) {
    add(
      `Concerns raised: ${g.concerns.raised} (${g.concerns.byKind.map((k) => `${k.label} ${k.count}`).join(", ") || "none"}), safeguarding: ${g.concerns.safeguarding}, closed this month: ${g.concerns.closed}, open now: ${g.concerns.openNow}. Compliments: ${g.concerns.compliments}.`,
    );
  }
  if (g.staffAudits) {
    const s = g.staffAudits;
    add(`Supervisions held: ${s.supervisions}, appraisals: ${s.appraisals}, spot checks: ${s.spotChecks} (${s.spotChecksShort} fell short). Staff overdue a supervision now: ${s.supervisionsBehind}; carers overdue a spot check now: ${s.spotChecksBehind}.`);
  }
  add(`Training compliance (assigned courses completed and in date): ${g.training.compliance ?? "n/a"}%. Staff fully up to date: ${g.training.upToDate} of ${g.training.people}.`);

  return [
    "You are helping the registered manager of a UK home care company write the summary at the top of their monthly governance report, which shows CQC (the Care Quality Commission) how the service is well-led.",
    "Write it from the figures below and nothing else. Do not invent events, causes, names or numbers. Where a figure is zero or missing, say so plainly rather than guessing why.",
    "Write two to four short paragraphs in plain British English, in the first person plural (\"we\"): what the month shows overall, what went well, what needs attention, and what we will do next. No headings, no bullet points, no markdown.",
    "",
    "The month's figures:",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
}
