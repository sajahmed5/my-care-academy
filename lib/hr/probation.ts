import { addMonths } from "@/lib/records";
import type { FormSection } from "@/lib/recruitment-application";

/**
 * Probation reviews (HR-PACK.md, agreed 29 Oct 2026): 6 months by default
 * (the contract template's length), with reviews at 1, 3 and 6 months; the
 * company can change both. The last review decides: passed, extended (by how
 * long and why) or not passed.
 *
 * Pure: the file, the Who's due list and the weekly email all read the
 * schedule from here, so they can never disagree.
 */

export interface ProbationSettings {
  months: number;
  reviewMonths: number[];
}

export const DEFAULT_PROBATION: ProbationSettings = { months: 6, reviewMonths: [1, 3, 6] };

export function probationFromRow(row: Record<string, unknown> | null | undefined): ProbationSettings {
  const months = Number(row?.probation_months);
  const reviews = Array.isArray(row?.probation_review_months) ? (row!.probation_review_months as unknown[]).map(Number) : null;
  return sanitiseProbation({ months: Number.isFinite(months) && months > 0 ? months : DEFAULT_PROBATION.months, reviewMonths: reviews ?? DEFAULT_PROBATION.reviewMonths });
}

/** Whole months, 1 to 24; review points inside the probation, sorted, and always the end. */
export function sanitiseProbation(s: { months: number; reviewMonths: number[] }): ProbationSettings {
  const months = Math.min(24, Math.max(1, Math.round(s.months) || DEFAULT_PROBATION.months));
  const points = [...new Set(s.reviewMonths.map((n) => Math.round(n)).filter((n) => n >= 1 && n < months))].sort((a, b) => a - b);
  return { months, reviewMonths: [...points, months] };
}

export interface Employment {
  start_date: string | null;
  probation_status: string;
  probation_ends_on: string | null;
}

export interface ReviewPoint {
  dueOn: string;
  label: string;
  isFinal: boolean;
}

/**
 * The review points for one person: each review month from their start date,
 * the last one at the end of their probation (moved on by an extension, with
 * a review at the new end). Nothing until there is a start date.
 */
export function reviewPoints(emp: Employment | null, s: ProbationSettings, heldFinals: string[] = []): ReviewPoint[] {
  if (!emp?.start_date) return [];
  const end = emp.probation_ends_on ?? addMonths(emp.start_date, s.months);
  const points: ReviewPoint[] = s.reviewMonths
    .filter((m) => m < s.months)
    .map((m) => ({ dueOn: addMonths(emp.start_date!, m), label: `${m}-month review`, isFinal: false }))
    .filter((p) => p.dueOn < end);
  // A final review already held at an earlier end (before an extension) stays on the list.
  for (const d of heldFinals) if (d !== end && !points.some((p) => p.dueOn === d)) points.push({ dueOn: d, label: "End of probation review", isFinal: true });
  points.push({ dueOn: end, label: heldFinals.length && end !== heldFinals[0] ? "End of extended probation" : "End of probation review", isFinal: true });
  return points.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export interface ReviewRecord {
  id: string;
  due_on: string;
  status: string;
  booked_on: string | null;
  booked_time: string | null;
  held_on: string | null;
  outcome: string | null;
  is_final: boolean;
}

export interface ScheduleLine extends ReviewPoint {
  review: ReviewRecord | null;
  /** "skipped": not held, but a later review has been, so it no longer falls due. */
  state: "held" | "skipped" | "booked" | "overdue" | "due_soon" | "later";
}

const DUE_SOON_DAYS = 14;

export function schedule(emp: Employment | null, s: ProbationSettings, reviews: ReviewRecord[], todayIso: string): ScheduleLine[] {
  const heldFinals = reviews.filter((r) => r.is_final && r.status === "held").map((r) => r.due_on);
  const byDue = new Map(reviews.map((r) => [r.due_on, r]));
  const soon = addDays(todayIso, DUE_SOON_DAYS);
  const lastHeld = reviews.filter((r) => r.status === "held").reduce((m, r) => (r.due_on > m ? r.due_on : m), "");
  return reviewPoints(emp, s, heldFinals).map((p) => {
    const review = byDue.get(p.dueOn) ?? null;
    const state: ScheduleLine["state"] =
      review?.status === "held"
        ? "held"
        : p.dueOn < lastHeld
          ? "skipped"
          : review?.booked_on
            ? "booked"
            : p.dueOn < todayIso
              ? "overdue"
              : p.dueOn <= soon
                ? "due_soon"
                : "later";
    return { ...p, review, state };
  });
}

/** Where probation stands, for lists: the next review to hold, or done. */
export function nextReview(emp: Employment | null, lines: ScheduleLine[]): ScheduleLine | null {
  if (!emp || emp.probation_status === "passed" || emp.probation_status === "not_passed" || emp.probation_status === "none") return null;
  return lines.find((l) => l.state !== "held" && l.state !== "skipped") ?? null;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const PROBATION_STATUS_LABEL: Record<string, string> = {
  in_probation: "In probation",
  extended: "Probation extended",
  passed: "Passed probation",
  not_passed: "Did not pass probation",
  none: "No probation",
};

// ─── The review form ────────────────────────────────────────────────────────

const RATINGS = ["Above what we expect", "What we expect", "Below what we expect"];
const rated = (id: string, label: string, help?: string) => [
  { id, label, type: "select" as const, options: RATINGS, required: true, help },
  { id: `${id}Notes`, label: "What you've seen", type: "longtext" as const },
];

/** Conduct and performance, as HR-PACK.md asks; what the site knows is shown beside it. */
export const PROBATION_SECTIONS: FormSection[] = [
  {
    id: "pbPerformance",
    title: "Performance",
    fields: [
      ...rated("quality", "Quality of their care", "Spot checks, competency and feedback from the people they visit."),
      ...rated("reliability", "Attendance and timekeeping"),
      ...rated("records", "Care notes and records"),
      ...rated("training", "Training and induction", "The figures above are from their training record."),
    ],
  },
  {
    id: "pbConduct",
    title: "Conduct",
    fields: [
      ...rated("conduct", "Conduct, attitude and following policy"),
      ...rated("teamwork", "Working with colleagues and the office"),
    ],
  },
  {
    id: "pbNext",
    title: "Looking ahead",
    fields: [
      { id: "strengths", label: "What's going well", type: "longtext", required: true },
      { id: "improve", label: "What needs to improve", type: "longtext" },
      { id: "agreed", label: "What was agreed (one per line): each becomes an action on their file", type: "longtext" },
      { id: "theirComments", label: "Their comments", type: "longtext" },
    ],
  },
];

export const INTERIM_OUTCOMES = [
  { value: "on_track", label: "On track" },
  { value: "concerns", label: "Concerns raised" },
] as const;

export const FINAL_OUTCOMES = [
  { value: "passed", label: "Passed" },
  { value: "extended", label: "Extended" },
  { value: "not_passed", label: "Not passed" },
] as const;

export function outcomeLabel(v: string | null): string {
  return [...INTERIM_OUTCOMES, ...FINAL_OUTCOMES].find((o) => o.value === v)?.label ?? "—";
}

/** What the outcome needs before the review can be finished. */
export function outcomeProblems(o: { isFinal: boolean; outcome: string | null; extendMonths: number | null; reason: string }): string[] {
  const allowed: string[] = (o.isFinal ? FINAL_OUTCOMES : INTERIM_OUTCOMES).map((x) => x.value);
  if (!o.outcome || !allowed.includes(o.outcome)) return ["Choose the outcome."];
  const out: string[] = [];
  if (o.outcome === "extended") {
    if (!o.extendMonths || o.extendMonths < 1 || o.extendMonths > 6) out.push("Say how many months to extend by (1 to 6).");
    if (!o.reason.trim()) out.push("Say why it's extended: it goes in their letter.");
  }
  if (o.outcome === "not_passed" && !o.reason.trim()) out.push("Say why they haven't passed: it goes in their letter.");
  return out;
}

/** The facts the site already knows, as stored on the review. */
export interface ProbationFacts {
  induction: { done: number; total: number } | null;
  trainingOverdue: number;
  trainingCompleted: number;
  supervisions: number;
  spotChecks: Array<{ on: string; outcome: string }>;
  competency: Array<{ on: string; area: string; outcome: string }>;
}
