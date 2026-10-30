/**
 * Service audits (SERVICE-AUDITS.md, agreed with Saj 29 Oct 2026).
 *
 * Every audit is a form: our defaults (the medication, care plan and
 * infection control checklists in lib/audits.ts), with a company's own
 * changes laid over them, and audits of its own. Some are about one client
 * and fall due client by client; the rest cover the whole service.
 *
 * An audit keeps a snapshot of the questions it was asked alongside the
 * answers, so a form edited later never rewrites one already signed.
 *
 * Pure: no I/O, safe in client components.
 */

import { AUDIT_KINDS } from "./audits";
import { nextDueFrom, type Interval, type IntervalUnit } from "./audit-forms";
import { dueStatus } from "./records";
import type { DueRowStatus } from "./due-view";

export type QuestionType = "yes_no" | "rating" | "text" | "photo";

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  { value: "yes_no", label: "Yes / No / N/A", hint: "Counts towards the score. A No becomes an action." },
  { value: "rating", label: "Rating 1–5", hint: "Counts towards the score. 2 or under becomes an action." },
  { value: "text", label: "Free text", hint: "In the auditor's own words." },
  { value: "photo", label: "Photo", hint: "Taken on the phone, kept with the audit." },
];

export function isQuestionType(v: unknown): v is QuestionType {
  return v === "yes_no" || v === "rating" || v === "text" || v === "photo";
}

export interface ServiceQuestion {
  id: string;
  label: string;
  help?: string;
  type: QuestionType;
}

export type AuditScope = "client" | "service";

export interface ServiceAuditForm {
  key: string;
  label: string;
  /** What it covers, one line. */
  blurb: string;
  scope: AuditScope;
  questions: ServiceQuestion[];
  due: Interval;
  /** One of ours, so there is a default to go back to. */
  ours: boolean;
  /** Only due for clients the company helps with their medicines. */
  medicationOnly?: boolean;
}

export const RATING_MAX = 5;

/** The score below which an audit waits for a manager, unless the company changes it. */
export const DEFAULT_REVIEW_BELOW = 80;

const months = (every: number): Interval => ({ every, unit: "months" });
const fromCode = (key: string): ServiceQuestion[] =>
  (AUDIT_KINDS.find((k) => k.key === key)?.questions ?? []).map((q) => ({ id: q.id, label: q.text, type: "yes_no" as const }));

/** Ours, in the order they are listed. Each starts as the checklist used before forms were editable. */
export const DEFAULT_SERVICE_FORMS: ServiceAuditForm[] = [
  {
    key: "medication",
    label: "Medication audit",
    blurb: "One client's MAR charts, storage, stock and PRN.",
    scope: "client",
    questions: fromCode("medication"),
    due: months(1),
    ours: true,
    medicationOnly: true,
  },
  {
    key: "care_plan",
    label: "Care plan audit",
    blurb: "Whether one client's plan is current, person-centred and followed.",
    scope: "client",
    questions: fromCode("care_plan"),
    due: months(3),
    ours: true,
  },
  {
    key: "infection_control",
    label: "Infection prevention and control audit",
    blurb: "PPE, hand hygiene, cleaning, waste and outbreak readiness, across the service.",
    scope: "service",
    questions: fromCode("infection_control"),
    due: months(3),
    ours: true,
  },
];

/** A company's change to one form, as stored in service_audit_forms. */
export interface ServiceFormOverride {
  key: string;
  label: string | null;
  scope: AuditScope;
  questions: ServiceQuestion[];
  due_every: number;
  due_unit: IntervalUnit;
  archived: boolean;
}

/**
 * Every audit a company uses: ours with its changes laid over them, then its
 * own, by name. An archived one drops out of the forms; audits already done
 * keep their own title and questions.
 */
export function resolveServiceForms(overrides: ServiceFormOverride[]): ServiceAuditForm[] {
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  const due = (o: ServiceFormOverride): Interval => ({ every: o.due_every, unit: o.due_unit });
  const ours = DEFAULT_SERVICE_FORMS.flatMap((d) => {
    const o = byKey.get(d.key);
    if (!o) return [d];
    if (o.archived) return [];
    return [{ ...d, label: o.label || d.label, questions: o.questions.length ? o.questions : d.questions, due: due(o) }];
  });
  const own = overrides
    .filter((o) => !o.archived && !DEFAULT_SERVICE_FORMS.some((d) => d.key === o.key) && o.questions.length > 0)
    .map(
      (o): ServiceAuditForm => ({
        key: o.key,
        label: o.label || o.key,
        blurb: o.scope === "client" ? "Your own audit, client by client." : "Your own audit, across the service.",
        scope: o.scope,
        questions: o.questions,
        due: due(o),
        ours: false,
      }),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...ours, ...own];
}

export function serviceForm(forms: ServiceAuditForm[], key: string): ServiceAuditForm | undefined {
  return forms.find((f) => f.key === key);
}

// ------------------------------------------------------------------ answers

export type ItemAnswer = "yes" | "no" | "na" | number | string | null;

/** One question as asked, and what was said. */
export interface AuditItem {
  id: string;
  label: string;
  type: QuestionType;
  answer: ItemAnswer;
  comment: string;
  /** For a photo question: where the photo is kept, once it is uploaded. */
  photo?: string | null;
}

const MAX_TEXT = 5000;
const MAX_COMMENT = 1000;

/**
 * The answers as posted, checked against the form: every Yes / No / N/A and
 * every rating needs an answer; text and photos are optional. Anything not on
 * the form is dropped rather than trusted. Photo paths are set by the server
 * after upload, never taken from the browser.
 */
export function readItems(
  questions: ServiceQuestion[],
  raw: unknown,
): { ok: true; items: AuditItem[] } | { ok: false; error: string } {
  const given = new Map<string, { answer?: unknown; comment?: unknown }>();
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string") {
        given.set((r as { id: string }).id, r as { answer?: unknown; comment?: unknown });
      }
    }
  }
  const items: AuditItem[] = [];
  for (const q of questions) {
    const g = given.get(q.id);
    const comment = typeof g?.comment === "string" ? g.comment.trim().slice(0, MAX_COMMENT) : "";
    let answer: ItemAnswer = null;
    if (q.type === "yes_no") {
      if (g?.answer !== "yes" && g?.answer !== "no" && g?.answer !== "na") return { ok: false, error: `Answer "${q.label}".` };
      answer = g.answer;
    } else if (q.type === "rating") {
      const n = Number(g?.answer);
      if (!Number.isInteger(n) || n < 1 || n > RATING_MAX) return { ok: false, error: `Rate "${q.label}" from 1 to ${RATING_MAX}.` };
      answer = n;
    } else if (q.type === "text") {
      answer = typeof g?.answer === "string" ? g.answer.trim().slice(0, MAX_TEXT) : "";
    }
    items.push({ id: q.id, label: q.label, type: q.type, answer, comment, ...(q.type === "photo" ? { photo: null } : {}) });
  }
  return { ok: true, items };
}

/**
 * What share of the scored questions were met, as a whole percentage: a Yes
 * is met, a No is not, N/A is left out; a rating counts as its share of 5.
 * Null when nothing scored applies.
 */
export function itemsScore(items: Pick<AuditItem, "type" | "answer">[]): number | null {
  let total = 0;
  let met = 0;
  for (const i of items) {
    if (i.type === "yes_no" && (i.answer === "yes" || i.answer === "no")) {
      total += 1;
      if (i.answer === "yes") met += 1;
    } else if (i.type === "rating" && typeof i.answer === "number") {
      total += 1;
      met += i.answer / RATING_MAX;
    }
  }
  return total === 0 ? null : Math.round((met / total) * 100);
}

/** What fell short: each No, and each rating of 2 or under. Each can become an action. */
export function itemFindings<T extends Pick<AuditItem, "id" | "label" | "type" | "answer">>(items: T[]): T[] {
  return items.filter((i) => (i.type === "yes_no" && i.answer === "no") || (i.type === "rating" && typeof i.answer === "number" && i.answer <= 2));
}

/** Below the company's level, it waits for a manager. An audit with no score has nothing to review. */
export function needsReview(score: number | null, reviewBelow: number): boolean {
  return score !== null && score < reviewBelow;
}

/** The audit from before forms were editable: questions in code, answers by id. */
export function legacyItems(kind: string, answers: Record<string, unknown>): AuditItem[] {
  return fromCode(kind).map((q) => {
    const a = answers[q.id];
    return { id: q.id, label: q.label, type: "yes_no", answer: a === "yes" || a === "no" || a === "na" ? a : null, comment: "" };
  });
}

export function answerLabel(item: Pick<AuditItem, "type" | "answer">): string {
  if (item.type === "yes_no") return item.answer === "yes" ? "Yes" : item.answer === "no" ? "No" : item.answer === "na" ? "N/A" : "—";
  if (item.type === "rating") return typeof item.answer === "number" ? `${item.answer} of ${RATING_MAX}` : "—";
  if (item.type === "text") return typeof item.answer === "string" && item.answer ? item.answer : "—";
  return "";
}

// ----------------------------------------------------------- editing forms

const QUESTION_ID = /^[a-z0-9_]{1,40}$/;
export const MAX_SERVICE_QUESTIONS = 60;

/**
 * Questions as edited in the browser, checked: each needs wording and a
 * type, ids must be unique and plain (answers are keyed by them), and at
 * least one must count towards the score — an audit with nothing to score
 * can never fall below the review level.
 */
export function readServiceQuestions(
  raw: unknown,
  { requireScored = true, allowEmpty = false, sections = false }: { requireScored?: boolean; allowEmpty?: boolean; sections?: boolean } = {},
): { ok: true; questions: ServiceQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "The questions could not be read. Reload and try again." };
  const out: ServiceQuestion[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const id = typeof r?.id === "string" ? r.id : "";
    const label = typeof r?.label === "string" ? r.label.trim() : "";
    const help = typeof r?.help === "string" ? r.help.trim() : "";
    if (!label) continue; // a blank row left at the bottom
    if (!QUESTION_ID.test(id) || seen.has(id) || !isQuestionType(r?.type)) {
      return { ok: false, error: "The questions could not be read. Reload and try again." };
    }
    seen.add(id);
    const section = sections && (r?.section === "own" || r?.section === "medication") ? { section: r.section } : {};
    out.push({ id, label: label.slice(0, 200), type: r.type, ...(help ? { help: help.slice(0, 300) } : {}), ...section });
  }
  if (out.length === 0 && !allowEmpty) return { ok: false, error: "Keep at least one question." };
  if (out.length > MAX_SERVICE_QUESTIONS) return { ok: false, error: `Keep it to ${MAX_SERVICE_QUESTIONS} questions or fewer.` };
  if (requireScored && !out.some((q) => q.type === "yes_no" || q.type === "rating")) {
    return { ok: false, error: "Keep at least one Yes / No or rating question, so the audit has a score." };
  }
  return { ok: true, questions: out };
}

/** A key for a company's own audit, from its name. */
export function ownAuditKey(label: string, taken: string[]): string {
  const base =
    "own_" +
    (label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "audit");
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

// --------------------------------------------------------------- what's due

export interface DueClient {
  id: string;
  name: string;
  region: string | null;
  medicationSupport: boolean;
}

/** One record about a client, newest first as the pages read them. */
export interface ClientRecord {
  id: string;
  clientId: string;
  heldOn: string;
  nextDue: string | null;
}

export interface ClientDueRow {
  client: DueClient;
  last: string | null;
  lastId: string | null;
  next: string | null;
  status: DueRowStatus;
}

/** The clients an audit is due for: medication audits only where the company helps with medicines. */
export function clientsFor(form: Pick<ServiceAuditForm, "medicationOnly">, clients: DueClient[]): DueClient[] {
  return form.medicationOnly ? clients.filter((c) => c.medicationSupport) : clients;
}

/**
 * Each client's line: the latest record's next-due date, which supersedes
 * the ones before it. A client never audited is "never" — due now.
 */
export function clientDueRows(clients: DueClient[], records: ClientRecord[], now: Date): ClientDueRow[] {
  const latest = new Map<string, ClientRecord>();
  for (const r of records) {
    const cur = latest.get(r.clientId);
    if (!cur || r.heldOn > cur.heldOn) latest.set(r.clientId, r);
  }
  return clients.map((client) => {
    const r = latest.get(client.id);
    if (!r) return { client, last: null, lastId: null, next: null, status: "never" as const };
    return { client, last: r.heldOn, lastId: r.id, next: r.nextDue, status: dueStatus(r.nextDue, now) };
  });
}

/** How many clients are overdue or never done — what the overview shows. */
export function dueCounts(rows: { status: DueRowStatus }[]): { late: number; soon: number; total: number } {
  return {
    late: rows.filter((r) => r.status === "overdue" || r.status === "never").length,
    soon: rows.filter((r) => r.status === "due_soon").length,
    total: rows.length,
  };
}

export { nextDueFrom };
