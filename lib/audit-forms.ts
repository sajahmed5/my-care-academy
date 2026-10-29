/**
 * Staff Audits forms (STAFF-AUDITS.md, agreed with Saj 29 Oct 2026).
 *
 * Each audit is a form with real questions, starting from these defaults.
 * MyRoster's supervision, appraisal and spot-check forms were the agreed
 * starting point; its source was not to hand when this was written, so the
 * questions follow the plan and what CQC and Skills for Care ask a
 * supervision to cover. A company changes them for itself.
 *
 * A record keeps a snapshot of the questions it was asked alongside the
 * answers, so a form edited later never rewrites one already signed.
 *
 * Pure: no I/O, safe in client components.
 */

import { addMonths } from "./records";

export type AuditKind = "supervision" | "appraisal";

export interface AuditQuestion {
  id: string;
  label: string;
  /** A prompt under the question, for whoever is filling it in. */
  help?: string;
}

export type IntervalUnit = "weeks" | "months";

export interface Interval {
  every: number;
  unit: IntervalUnit;
}

export interface AuditForm {
  kind: AuditKind;
  label: string;
  questions: AuditQuestion[];
  /** Appraisal only: what the person fills in on their own login beforehand. */
  selfAssessment: AuditQuestion[];
  due: Interval;
}

/** A question and what was said, as it was asked at the time. */
export interface TextAnswer {
  id: string;
  label: string;
  answer: string;
}

export const DEFAULT_FORMS: Record<AuditKind, AuditForm> = {
  supervision: {
    kind: "supervision",
    label: "Supervision",
    due: { every: 3, unit: "months" },
    selfAssessment: [],
    questions: [
      { id: "wellbeing", label: "How are they?", help: "Health, wellbeing, and anything outside work that is affecting them." },
      { id: "workload", label: "Workload and rota", help: "Hours, travel between calls, enough time at each visit." },
      { id: "clients", label: "The clients they visit", help: "Changes in anyone's needs, worries, things that have gone well." },
      { id: "practice", label: "Their practice", help: "What has gone well since last time, and what could be better." },
      { id: "training", label: "Training and development", help: "Training due, courses they would like, skills to build." },
      { id: "concerns", label: "Concerns raised", help: "Safeguarding, whistleblowing, colleagues, anything they want on record." },
      { id: "feedback", label: "Feedback for the company", help: "What would make the job easier." },
    ],
  },
  appraisal: {
    kind: "appraisal",
    label: "Appraisal",
    due: { every: 12, unit: "months" },
    questions: [
      { id: "year", label: "The year looked back on", help: "What they achieved and what went well." },
      { id: "challenges", label: "What was hard", help: "And how it was handled." },
      { id: "feedback", label: "Feedback received", help: "From clients, families and colleagues." },
      { id: "standards", label: "Against the role and our values", help: "Reliability, care, record keeping, teamwork." },
      { id: "goals", label: "Goals for the next twelve months" },
      { id: "training", label: "Training plan", help: "Courses and qualifications for the year ahead." },
      { id: "support", label: "Support we will give" },
    ],
    selfAssessment: [
      { id: "went_well", label: "What has gone well for you this year?" },
      { id: "hard", label: "What have you found hard?" },
      { id: "learn", label: "What would you like to get better at, or learn, next year?" },
      { id: "support", label: "Is there anything we could do to support you better?" },
    ],
  },
};

export const AUDIT_KINDS: { value: AuditKind; label: string }[] = [
  { value: "supervision", label: "Supervision" },
  { value: "appraisal", label: "Appraisal" },
];

export function isAuditKind(v: string): v is AuditKind {
  return v === "supervision" || v === "appraisal";
}

/** The same day, `weeks` later. */
export function addWeeks(iso: string, weeks: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d + weeks * 7)).toISOString().slice(0, 10);
}

/** When the next one falls due, from the day this one was held. */
export function nextDueFrom(iso: string, due: Interval): string {
  return due.unit === "weeks" ? addWeeks(iso, due.every) : addMonths(iso, due.every);
}

/** "Every 3 months", "Every 12 weeks". */
export function intervalLabel(due: Interval): string {
  const unit = due.every === 1 ? due.unit.slice(0, -1) : due.unit;
  return due.every === 1 ? `Every ${unit}` : `Every ${due.every} ${unit}`;
}

const MAX_ANSWER = 5000;

/**
 * The answers to a form's questions, snapshotted with each question's wording.
 * Blank answers are kept — "nothing raised" is an answer — but at least one
 * must say something, or the record is a signature on an empty page.
 */
export function readTextAnswers(
  questions: AuditQuestion[],
  raw: Record<string, string>,
): { ok: true; answers: TextAnswer[] } | { ok: false; error: string } {
  const answers = questions.map((q) => ({
    id: q.id,
    label: q.label,
    answer: String(raw[q.id] ?? "").trim().slice(0, MAX_ANSWER),
  }));
  if (!answers.some((a) => a.answer)) {
    return { ok: false, error: "Answer at least one of the questions." };
  }
  return { ok: true, answers };
}

/** What happened to an action agreed last time. */
export type ActionReviewStatus = "done" | "not_done";

export interface ActionReview {
  id: string;
  title: string;
  status: ActionReviewStatus;
  comment: string;
}

/**
 * Last time's actions as reviewed, keeping only the ones that were on the
 * table. Anything else in the payload is dropped rather than trusted.
 */
export function readActionsReview(
  offered: { id: string; title: string }[],
  raw: unknown,
): ActionReview[] {
  const given = new Map<string, { status?: unknown; comment?: unknown }>();
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string") {
        given.set((r as { id: string }).id, r as { status?: unknown; comment?: unknown });
      }
    }
  }
  return offered.map((a) => {
    const g = given.get(a.id);
    return {
      id: a.id,
      title: a.title,
      status: g?.status === "done" ? "done" : "not_done",
      comment: typeof g?.comment === "string" ? g.comment.trim().slice(0, 1000) : "",
    };
  });
}
