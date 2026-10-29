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

// ------------------------------------------------- spot checks and competency

/** How one item on a spot check, or one criterion, went. */
export type CheckResult = "yes" | "no" | "na";

export const CHECK_RESULTS: { value: CheckResult; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

export interface CheckAnswer {
  id: string;
  label: string;
  result: CheckResult;
  comment: string;
}

/** A checklist form: the spot check, or one competency area. */
export interface CheckForm {
  key: string;
  label: string;
  items: AuditQuestion[];
  due: Interval;
  /**
   * Courses (by slug) to suggest when this falls short — by item for a spot
   * check, for the whole area for competency. A manager confirms each one.
   */
  courses: Record<string, string[]>;
}

/** Unannounced, on a phone in the client's home (STAFF-AUDITS.md). */
export const SPOT_CHECK_FORM: CheckForm = {
  key: "spot_check",
  label: "Spot check",
  due: { every: 12, unit: "weeks" },
  items: [
    { id: "on_time", label: "Arrived on time", help: "Against the rota, or with a reason the client was told." },
    { id: "id_badge", label: "Wearing their ID badge" },
    { id: "uniform", label: "In uniform, clean and tidy" },
    { id: "ppe", label: "PPE used correctly", help: "Gloves and apron on and off at the right times, disposed of safely." },
    { id: "hand_hygiene", label: "Hand hygiene", help: "Washed or gelled before and after care." },
    { id: "dignity", label: "Dignity and respect", help: "Asked consent, kept them covered, spoke to them, not over them." },
    { id: "care_plan", label: "Followed the care plan" },
    { id: "medication", label: "Medication given safely", help: "Checked the MAR, right dose and time, recorded. N/A if not on the call." },
    { id: "records", label: "Records written up", help: "Daily notes clear, accurate and signed." },
  ],
  courses: {
    ppe: ["infection-prevention-and-control"],
    hand_hygiene: ["infection-prevention-and-control"],
    dignity: ["privacy-and-dignity", "person-centred-care"],
    care_plan: ["person-centred-care", "care-planning"],
    medication: ["medication-awareness"],
    records: ["record-keeping-and-documentation"],
  },
};

const yearly: Interval = { every: 12, unit: "months" };

/**
 * Each skill signed off against its own criteria. A company can add areas and
 * edit the criteria (part 3); these are where everyone starts.
 */
export const COMPETENCY_FORMS: CheckForm[] = [
  {
    key: "medication",
    label: "Medication",
    due: yearly,
    courses: { area: ["medication-awareness"] },
    items: [
      { id: "consent", label: "Explains and gets consent before giving medication" },
      { id: "mar", label: "Checks the MAR chart against the medication and the person" },
      { id: "six_rights", label: "Right person, medicine, dose, route, time — and their right to refuse" },
      { id: "hygiene", label: "Washes hands and handles medication without touching it" },
      { id: "observes", label: "Watches the medication being taken" },
      { id: "records", label: "Records on the MAR straight away, with any refusal or error" },
      { id: "storage", label: "Stores medication safely and as directed" },
      { id: "escalates", label: "Knows what to do and who to tell if something goes wrong" },
    ],
  },
  {
    key: "hoist",
    label: "Hoist",
    due: yearly,
    courses: { area: ["moving-and-handling"] },
    items: [
      { id: "plan", label: "Reads the moving and handling plan first" },
      { id: "checks", label: "Checks the hoist and sling: in date, LOLER label, no damage, battery charged" },
      { id: "sling", label: "Uses the right sling and size for the person" },
      { id: "explains", label: "Explains each step to the person and gets consent" },
      { id: "two_carers", label: "Works with a second carer where the plan says two" },
      { id: "technique", label: "Fits the sling, attaches it and lifts smoothly, without rushing" },
      { id: "dignity", label: "Keeps the person covered and comfortable throughout" },
      { id: "reports", label: "Reports faults and takes a faulty hoist out of use" },
    ],
  },
  {
    key: "moving_people",
    label: "Moving and handling people",
    due: yearly,
    courses: { area: ["moving-and-handling", "slips-trips-and-falls"] },
    items: [
      { id: "assess", label: "Assesses the person and the space before moving them" },
      { id: "plan", label: "Follows the moving and handling plan" },
      { id: "aids", label: "Uses the aids in the plan (slide sheet, turning disc, frame) correctly" },
      { id: "encourages", label: "Encourages the person to do what they can for themselves" },
      { id: "posture", label: "Keeps a good posture: stable base, bent knees, no twisting" },
      { id: "no_drag", label: "Never drags or lifts under the arms" },
      { id: "falls", label: "Knows what to do if the person falls" },
    ],
  },
  {
    key: "moving_objects",
    label: "Moving and handling objects",
    due: yearly,
    courses: { area: ["moving-and-handling", "health-and-safety"] },
    items: [
      { id: "assess", label: "Thinks about the load, the task and the space before lifting (TILE)" },
      { id: "posture", label: "Lifts with a stable base, close to the body, without twisting" },
      { id: "help", label: "Gets help or equipment for anything too heavy or awkward" },
      { id: "clear", label: "Keeps walkways clear of trip hazards" },
    ],
  },
  {
    key: "food_hydration",
    label: "Food and hydration support",
    due: yearly,
    courses: { area: ["fluids-and-nutrition", "food-hygiene-and-nutrition"] },
    items: [
      { id: "choice", label: "Offers choice and respects preferences, culture and diet" },
      { id: "hygiene", label: "Prepares food hygienically, checking dates and storage" },
      { id: "allergies", label: "Knows the person's allergies and any modified diet or textures" },
      { id: "position", label: "Sits the person upright and supports them at their pace" },
      { id: "fluids", label: "Leaves drinks within reach and encourages fluids" },
      { id: "records", label: "Records food and fluid intake where the plan asks" },
      { id: "concerns", label: "Spots and reports choking, weight loss or poor intake" },
    ],
  },
  {
    key: "de_escalation",
    label: "De-escalation",
    due: yearly,
    courses: { area: ["conflict-resolution", "behaviours-that-challenge"] },
    items: [
      { id: "triggers", label: "Knows the person's triggers and what helps, from their plan" },
      { id: "calm", label: "Stays calm, with a soft voice and open body language" },
      { id: "space", label: "Gives space and keeps a safe exit" },
      { id: "listens", label: "Listens and acknowledges how the person feels" },
      { id: "no_restraint", label: "Never uses restraint outside the plan" },
      { id: "records", label: "Records and reports what happened" },
    ],
  },
  {
    key: "infection_control",
    label: "Infection control",
    due: yearly,
    courses: { area: ["infection-prevention-and-control"] },
    items: [
      { id: "hands", label: "Washes hands properly, at the right moments" },
      { id: "ppe", label: "Puts PPE on and takes it off in the right order" },
      { id: "waste", label: "Disposes of waste and sharps safely" },
      { id: "spills", label: "Cleans up spills of body fluids correctly" },
      { id: "laundry", label: "Handles soiled laundry safely" },
      { id: "illness", label: "Knows not to work while unwell with vomiting or diarrhoea" },
    ],
  },
  {
    key: "personal_care",
    label: "Personal care and dignity",
    due: yearly,
    courses: { area: ["personal-care", "privacy-and-dignity"] },
    items: [
      { id: "consent", label: "Asks consent and offers choice throughout" },
      { id: "privacy", label: "Closes doors and curtains and keeps the person covered" },
      { id: "independence", label: "Encourages the person to do what they can" },
      { id: "skin", label: "Checks skin and reports redness or sores" },
      { id: "continence", label: "Gives continence care with dignity" },
      { id: "oral", label: "Supports oral care" },
      { id: "talks", label: "Talks with the person, not over them" },
    ],
  },
];

export function competencyForm(key: string, forms: CheckForm[] = COMPETENCY_FORMS): CheckForm | undefined {
  return forms.find((f) => f.key === key);
}

/**
 * The checklist as answered. Every item needs a result, and a "No" needs a
 * comment: a spot check that says a carer fell short without saying how is
 * no use to them or to an inspector.
 */
export function readCheckAnswers(
  items: AuditQuestion[],
  raw: unknown,
): { ok: true; answers: CheckAnswer[] } | { ok: false; error: string } {
  const given = new Map<string, { result?: unknown; comment?: unknown }>();
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string") {
        given.set((r as { id: string }).id, r as { result?: unknown; comment?: unknown });
      }
    }
  }
  const answers: CheckAnswer[] = [];
  for (const item of items) {
    const g = given.get(item.id);
    const result = g?.result;
    if (result !== "yes" && result !== "no" && result !== "na") {
      return { ok: false, error: `Answer "${item.label}".` };
    }
    const comment = typeof g?.comment === "string" ? g.comment.trim().slice(0, 1000) : "";
    if (result === "no" && !comment) return { ok: false, error: `Say what was wrong with "${item.label}".` };
    answers.push({ id: item.id, label: item.label, result, comment });
  }
  return { ok: true, answers };
}

/** The outcome the answers point to, as a starting point the assessor can change. */
export function suggestedOutcome(answers: { result: CheckResult | null }[]): "met" | "developing" | "not_met" {
  const noes = answers.filter((a) => a.result === "no").length;
  if (noes === 0) return "met";
  return noes >= 3 ? "not_met" : "developing";
}

/**
 * Courses a record suggests, by slug, de-duplicated: for a spot check, from
 * the items answered "No"; for competency, the area's own courses. Only when
 * the outcome fell short — a met check with one "No" is a conversation, not
 * a training need.
 */
export function suggestedSlugs(form: CheckForm, outcome: string, answers: { id: string; result: string }[]): string[] {
  if (outcome === "met") return [];
  const slugs = form.courses.area
    ? form.courses.area
    : answers.filter((a) => a.result === "no").flatMap((a) => form.courses[a.id] ?? []);
  return [...new Set(slugs)];
}
