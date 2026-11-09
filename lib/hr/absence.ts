import type { FormSection } from "@/lib/recruitment-application";
import { addDays } from "./probation";

/**
 * Sickness absence and return to work (HR-PACK.md, agreed 29 Oct 2026).
 *
 * - The office records an absence: start and return dates, the reason as a
 *   category, self-certified up to 7 days or a fit note beyond that.
 * - A return-to-work interview is due within 3 days of coming back, and asks
 *   the care question: after sickness and diarrhoea, have 48 hours passed
 *   since the last symptoms?
 * - Over 4 weeks is long-term: a welfare meeting every 4 weeks while they're
 *   off, and a record of any occupational health referral.
 * - Triggers: a Bradford Factor score (spells² × days) over the last 52 weeks,
 *   against trigger points the company sets. Reaching one flags it to the
 *   manager, who can open an absence capability case. Nothing is automatic.
 *
 * Days are calendar days: home care runs seven days a week, and the site has
 * no rota to say which days someone was due to work.
 *
 * Pure: the file, the Absence page and the weekly email all read from here.
 */

export interface AbsenceReason {
  /** One of ours (illness, injury…), or own_… for one the company added. */
  key: string;
  label: string;
  /** Never counts towards a trigger: counting it can be discrimination. */
  excluded: boolean;
}

/**
 * Our reasons: broad on purpose (Saj, 9 Nov 2026: the first list was far
 * too specific). A company renames, removes or adds to them under Settings →
 * HR → Absence; the two that must never count stay, whatever they're called.
 */
export const OUR_ABSENCE_REASONS: AbsenceReason[] = [
  { key: "illness", label: "Illness (cold, flu, stomach bug)", excluded: false },
  { key: "injury", label: "Injury", excluded: false },
  { key: "injury_at_work", label: "Injury at work", excluded: true },
  { key: "mental_health", label: "Stress or mental health", excluded: false },
  { key: "medical", label: "Operation, hospital or medical appointment", excluded: false },
  { key: "pregnancy", label: "Pregnancy-related", excluded: true },
  { key: "other", label: "Other", excluded: false },
];

/** Kept on every company's list, and always left out of the triggers: the law, not a preference. */
export const PROTECTED_REASON_KEYS = ["injury_at_work", "pregnancy"];
export const MAX_REASONS = 20;

/**
 * The company's list from hr_settings.absence_reasons, or ours when it has
 * none. Labels are what the absence record stores, so each is unique;
 * the protected two are put back if they're missing.
 */
export function sanitiseReasons(raw: unknown): AbsenceReason[] {
  if (!Array.isArray(raw)) return OUR_ABSENCE_REASONS;
  const ours = new Set(OUR_ABSENCE_REASONS.map((r) => r.key));
  const out: AbsenceReason[] = [];
  for (const item of raw.slice(0, MAX_REASONS)) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const key = typeof r.key === "string" && (ours.has(r.key) || /^own_[a-z0-9]{4,12}$/.test(r.key)) ? r.key : null;
    if (!label || !key || out.some((t) => t.key === key || t.label.toLowerCase() === label.toLowerCase())) continue;
    out.push({ key, label, excluded: PROTECTED_REASON_KEYS.includes(key) || r.excluded === true });
  }
  for (const key of PROTECTED_REASON_KEYS) {
    if (!out.some((r) => r.key === key)) {
      const back = OUR_ABSENCE_REASONS.find((r) => r.key === key)!;
      if (!out.some((r) => r.label.toLowerCase() === back.label.toLowerCase())) out.push(back);
    }
  }
  return out.length ? out : OUR_ABSENCE_REASONS;
}

export const sameAsOurReasons = (list: AbsenceReason[]) =>
  list.length === OUR_ABSENCE_REASONS.length && list.every((r, i) => r.key === OUR_ABSENCE_REASONS[i].key && r.label === OUR_ABSENCE_REASONS[i].label && r.excluded === OUR_ABSENCE_REASONS[i].excluded);

/** The reason an absence record names, by its label, or null for one no longer on the list. */
export const reasonByLabel = (reasons: AbsenceReason[], label: string) => reasons.find((r) => r.label === label) ?? null;

/** Never counts towards a trigger, by its label (an old label no longer listed counts). */
export const reasonExcluded = (reasons: AbsenceReason[], label: string) => reasonByLabel(reasons, label)?.excluded === true;

export const SELF_CERT_DAYS = 7;
export const RTW_DUE_DAYS = 3;
export const LONG_TERM_DAYS = 28;
export const WELFARE_EVERY_DAYS = 28;
export const DEFAULT_TRIGGERS = [51, 201, 401];

export interface Absence {
  id: string;
  user_id: string;
  start_date: string;
  returned_on: string | null;
  reason: string;
  certification: string;
  fit_note_until: string | null;
  excluded_from_triggers: boolean;
  rtw_status: string;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

/** Days off: from the start to the day before they came back, or to today while still off. */
export function daysOff(a: Pick<Absence, "start_date" | "returned_on">, todayIso: string): number {
  const end = a.returned_on ?? addDays(todayIso, 1);
  return Math.max(1, daysBetween(a.start_date, end));
}

export const isOngoing = (a: Pick<Absence, "returned_on">) => !a.returned_on;
export const isLongTerm = (a: Pick<Absence, "start_date" | "returned_on">, todayIso: string) => daysOff(a, todayIso) > LONG_TERM_DAYS;

/** A fit note is wanted after 7 days and there isn't one. */
export function needsFitNote(a: Pick<Absence, "start_date" | "returned_on" | "certification">, todayIso: string): boolean {
  return daysOff(a, todayIso) > SELF_CERT_DAYS && a.certification !== "fit_note";
}

/** When the return-to-work interview falls due: 3 days after the first day back. */
export function rtwDueOn(a: Pick<Absence, "returned_on">): string | null {
  return a.returned_on ? addDays(a.returned_on, RTW_DUE_DAYS) : null;
}

export function rtwOutstanding(a: Pick<Absence, "returned_on" | "rtw_status">): boolean {
  return !!a.returned_on && a.rtw_status === "none";
}

/** The next welfare meeting for a long-term absence still going on, or null. */
export function welfareDueOn(a: Pick<Absence, "start_date" | "returned_on">, meetings: string[], todayIso: string): string | null {
  if (!isOngoing(a) || !isLongTerm(a, todayIso)) return null;
  const last = [...meetings].sort().pop();
  return last ? addDays(last, WELFARE_EVERY_DAYS) : addDays(a.start_date, LONG_TERM_DAYS);
}

export interface Bradford {
  spells: number;
  days: number;
  score: number;
  /** The highest trigger point reached, or null. */
  reached: number | null;
}

/**
 * The Bradford Factor over the 52 weeks to today: each spell that started in
 * that time and isn't excluded, its days counted up to today.
 */
export function bradford(absences: Absence[], todayIso: string, triggers: number[] = DEFAULT_TRIGGERS): Bradford {
  const from = addDays(todayIso, -364);
  const counted = absences.filter((a) => !a.excluded_from_triggers && a.start_date >= from && a.start_date <= todayIso);
  const spells = counted.length;
  const days = counted.reduce((n, a) => n + daysOff(a, todayIso), 0);
  const score = spells * spells * days;
  const reached = [...triggers].sort((x, y) => x - y).filter((t) => score >= t).pop() ?? null;
  return { spells, days, score, reached };
}

export function sanitiseTriggers(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw.map(Number) : [];
  const ok = [...new Set(list.filter((n) => Number.isInteger(n) && n > 0 && n < 100000))].sort((a, b) => a - b).slice(0, 6);
  return ok.length ? ok : DEFAULT_TRIGGERS;
}

// ─── The return-to-work interview ───────────────────────────────────────────

export const RTW_SECTIONS: FormSection[] = [
  {
    id: "rtwAbsence",
    title: "The absence",
    fields: [
      { id: "feelingNow", label: "How are they feeling now?", type: "longtext", required: true },
      { id: "reasonRight", label: "Is the reason recorded the right one?", type: "yesno", required: true },
      { id: "reasonActual", label: "What was it?", type: "longtext", required: true, showWhen: { field: "reasonRight", equals: "no" } },
      { id: "sawGp", label: "Did they see a GP or go to hospital?", type: "yesno", required: true },
      { id: "workRelated", label: "Was it caused or made worse by work?", type: "yesno", required: true },
      { id: "workRelatedDetail", label: "How? (consider whether it is reportable under RIDDOR)", type: "longtext", required: true, showWhen: { field: "workRelated", equals: "yes" } },
    ],
  },
  {
    id: "rtwCare",
    title: "Safe to care",
    fields: [
      {
        id: "dv48",
        label: "After sickness and diarrhoea: have 48 hours passed since their last symptoms?",
        type: "select",
        options: ["Yes", "No", "Not applicable"],
        required: true,
        help: "Anyone who has had sickness or diarrhoea must not work until 48 hours after their last symptoms.",
      },
      { id: "medication", label: "Are they taking anything that could affect their work (drowsiness, driving)?", type: "yesno", required: true },
      { id: "medicationDetail", label: "What, and what that means for their visits", type: "longtext", showWhen: { field: "medication", equals: "yes" } },
      { id: "fitForDuties", label: "Are they fit to return to all their duties?", type: "yesno", required: true },
      { id: "adjustments", label: "What adjustments are agreed (lighter visits, no moving and handling, a phased return)?", type: "longtext", required: true, showWhen: { field: "fitForDuties", equals: "no" } },
    ],
  },
  {
    id: "rtwSupport",
    title: "Support",
    fields: [
      { id: "support", label: "Anything we can do to help, or to stop it happening again", type: "longtext" },
      { id: "theirComments", label: "Their comments", type: "longtext" },
    ],
  },
];

/** What the office reads first on a finished interview. */
export function rtwFlags(answers: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (answers.dv48 === "No") out.push("48 hours have NOT passed since their last sickness or diarrhoea: they must not work yet.");
  if (answers.fitForDuties === "no") out.push("Not fit for all duties: adjustments agreed.");
  if (answers.workRelated === "yes") out.push("Work-related: check whether it is reportable under RIDDOR.");
  if (answers.medication === "yes") out.push("Medication that could affect their work.");
  return out;
}

// ─── Across the company ─────────────────────────────────────────────────────

export interface AbsenceDue {
  /** Off now. */
  off: Absence[];
  /** Back, with the interview not held. */
  rtw: Array<Absence & { dueOn: string; late: boolean }>;
  /** Long-term and still off, with the next welfare meeting due within a week (or late). */
  welfare: Array<Absence & { dueOn: string }>;
  /** Per person at or over a trigger point. */
  triggers: Array<{ userId: string } & Bradford>;
}

export function absenceDue(
  absences: Absence[],
  meetings: Array<{ absence_id: string; held_on: string }>,
  triggerPoints: number[],
  todayIso: string,
  currentStaff?: Set<string>,
): AbsenceDue {
  const mine = currentStaff ? absences.filter((a) => currentStaff.has(a.user_id)) : absences;
  const soon = addDays(todayIso, 7);
  const off = mine.filter(isOngoing);
  const rtw = mine
    .filter(rtwOutstanding)
    .map((a) => ({ ...a, dueOn: rtwDueOn(a)!, late: rtwDueOn(a)! < todayIso }))
    .sort((x, y) => x.dueOn.localeCompare(y.dueOn));
  const welfare = off
    .map((a) => ({ ...a, dueOn: welfareDueOn(a, meetings.filter((m) => m.absence_id === a.id).map((m) => m.held_on), todayIso) }))
    .filter((a): a is Absence & { dueOn: string } => !!a.dueOn && a.dueOn <= soon);
  const byUser = new Map<string, Absence[]>();
  for (const a of mine) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  const triggers = [...byUser.entries()]
    .map(([userId, list]) => ({ userId, ...bradford(list, todayIso, triggerPoints) }))
    .filter((b) => b.reached !== null)
    .sort((x, y) => y.score - x.score);
  return { off, rtw, welfare, triggers };
}
