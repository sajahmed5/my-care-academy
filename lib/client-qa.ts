/**
 * Client QAs (SERVICE-AUDITS.md, Client QAs, agreed with Saj 29 Oct 2026).
 *
 * A quality check with one client, by visit or phone, with the client or a
 * family member: a rating of 1–10 under each of CQC's five headings,
 * medication questions for a client the company helps with medicines, the
 * company's own questions, what we do well and could do better, and an
 * action plan for the office. If it couldn't be done it still counts as
 * attempted. MyRoster's client QA form was the agreed starting point; its
 * source was not to hand, so the wording follows the plan and CQC's key
 * questions. A company changes the medication and its own questions, and how
 * often a QA falls due, under Settings.
 *
 * Pure: no I/O, safe in client components.
 */

import type { Interval, IntervalUnit } from "./audit-forms";
import { formatDate } from "./dates";
import { isQuestionType, type ServiceAuditForm, type ServiceQuestion } from "./service-audits";

export const QA_FORM_KEY = "client_qa";

export type QaHeading = "safe" | "effective" | "caring" | "responsive" | "well_led";

export const QA_HEADINGS: { key: QaHeading; label: string; prompt: string }[] = [
  { key: "safe", label: "Safe", prompt: "Do you feel safe with your carers? Are you protected from harm?" },
  { key: "effective", label: "Effective", prompt: "Does the care you get meet your needs and help you live the way you want?" },
  { key: "caring", label: "Caring", prompt: "Are carers kind, respectful and do they treat you with dignity?" },
  { key: "responsive", label: "Responsive", prompt: "Do we listen and change things when your needs or wishes change? Do carers arrive when expected?" },
  { key: "well_led", label: "Well-led", prompt: "Is the office easy to reach, and do you know who to speak to if something is wrong?" },
];

export const QA_RATING_MAX = 10;

export const QA_METHODS = [
  { value: "visit", label: "A visit" },
  { value: "phone", label: "A phone call" },
] as const;

export const QA_WITH = [
  { value: "client", label: "The client" },
  { value: "family", label: "A family member" },
] as const;

/** Asked only for a client the company helps with their medicines. */
export const DEFAULT_QA_MEDICATION: ServiceQuestion[] = [
  { id: "med_on_time", label: "Are your medicines given at the right times?", type: "yes_no" },
  { id: "med_recorded", label: "Do carers check and record your medicines at every visit?", type: "yes_no" },
  { id: "med_supply", label: "Do you have enough of your medicines, kept safely?", type: "yes_no" },
  { id: "med_explained", label: "Do carers explain what they are giving you, and ask first?", type: "yes_no" },
  { id: "med_changes", label: "Has anything changed with your medicines that we should know about?", type: "text" },
];

export interface QaForm {
  due: Interval;
  medication: ServiceQuestion[];
  /** The company's own questions, asked in every QA. */
  own: ServiceQuestion[];
}

export const DEFAULT_QA_FORM: QaForm = { due: { every: 3, unit: "months" }, medication: DEFAULT_QA_MEDICATION, own: [] };

/** A QA question as stored: which part of the form it sits in. */
export type QaQuestion = ServiceQuestion & { section?: "medication" | "own" };

/** The company's change to the QA (service_audit_forms key client_qa), laid over ours. */
export function resolveQaForm(override: { questions: unknown; due_every: number; due_unit: IntervalUnit } | null): QaForm {
  if (!override) return DEFAULT_QA_FORM;
  const list: QaQuestion[] = Array.isArray(override.questions)
    ? override.questions.filter((q) => q && typeof q.id === "string" && typeof q.label === "string" && isQuestionType(q.type))
    : [];
  const strip = ({ section: _s, ...q }: QaQuestion): ServiceQuestion => q;
  return {
    due: { every: override.due_every, unit: override.due_unit },
    medication: list.filter((q) => q.section !== "own").map(strip),
    own: list.filter((q) => q.section === "own").map(strip),
  };
}

/** The QA as one of the client-by-client lines on Audits and Audits due. */
export function qaAsServiceForm(form: QaForm): ServiceAuditForm {
  return {
    key: QA_FORM_KEY,
    label: "Client QA",
    blurb: "A visit or phone call with each client: ratings under CQC's five headings.",
    scope: "client",
    questions: [],
    due: form.due,
    ours: true,
  };
}

/** Where to carry out an audit or a QA, for a client or not. */
export function runHref(formKey: string, clientId?: string | null): string {
  if (formKey === QA_FORM_KEY) return `/org/audits/qa/new${clientId ? `?client=${clientId}` : ""}`;
  return `/org/audits/new?form=${formKey}${clientId ? `&client=${clientId}` : ""}`;
}

export type QaRatings = Record<QaHeading, number>;

/** The five ratings as one score out of 100: their average, times ten. */
export function qaScore(ratings: Partial<Record<QaHeading, number | null>>): number | null {
  const values = QA_HEADINGS.map((h) => ratings[h.key]).filter((v): v is number => typeof v === "number");
  if (values.length !== QA_HEADINGS.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * (100 / QA_RATING_MAX));
}

/** Each rating, checked: a whole number from 1 to 10 under every heading. */
export function readRatings(raw: Record<string, unknown>): { ok: true; ratings: QaRatings } | { ok: false; error: string } {
  const out = {} as QaRatings;
  for (const h of QA_HEADINGS) {
    const n = Number(raw[h.key]);
    if (!Number.isInteger(n) || n < 1 || n > QA_RATING_MAX) return { ok: false, error: `Rate "${h.label}" from 1 to ${QA_RATING_MAX}.` };
    out[h.key] = n;
  }
  return { ok: true, ratings: out };
}

/** Who it was with, in a line: "Mrs Smith (daughter)" or the client's own name. */
export function qaWho(qa: { with_whom: string | null; family_name: string | null; family_relationship: string | null; client_name: string }): string {
  if (qa.with_whom === "family") {
    const name = qa.family_name?.trim() || "A family member";
    return qa.family_relationship?.trim() ? `${name} (${qa.family_relationship.trim()})` : name;
  }
  return qa.client_name;
}

/**
 * What goes into a concern raised from a QA: what could be better, any
 * heading rated 4 or under, and any medication question answered No. Taken
 * from the QA only — the office adds to it at triage.
 */
export function qaConcernText(qa: {
  held_on: string;
  method: string;
  do_better: string | null;
  action_plan: string | null;
  ratings: Partial<Record<QaHeading, number | null>>;
  medication: { label: string; answer: unknown; comment?: string }[];
}): string {
  const lines: string[] = [`Raised from the client QA (${qa.method === "phone" ? "phone call" : "visit"}) on ${formatDate(qa.held_on, { day: "numeric", month: "long", year: "numeric" })}.`];
  if (qa.do_better?.trim()) lines.push("", "What we could do better:", qa.do_better.trim());
  const low = QA_HEADINGS.filter((h) => typeof qa.ratings[h.key] === "number" && (qa.ratings[h.key] as number) <= 4);
  if (low.length) lines.push("", `Rated low: ${low.map((h) => `${h.label} ${qa.ratings[h.key]}/10`).join(", ")}.`);
  const meds = qa.medication.filter((m) => m.answer === "no");
  if (meds.length) {
    lines.push("", "Medication:");
    for (const m of meds) lines.push(`- ${m.label} No${m.comment ? ` — ${m.comment}` : ""}`);
  }
  if (qa.action_plan?.trim()) lines.push("", "Action plan from the QA:", qa.action_plan.trim());
  return lines.join("\n");
}
