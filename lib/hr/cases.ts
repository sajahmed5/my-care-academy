import { addMonths } from "@/lib/records";
import { addDays } from "./probation";

/**
 * Disciplinary and grievance (HR-PACK.md, agreed 29 Oct 2026), following the
 * ACAS Code of Practice on Disciplinary and Grievance Procedures.
 *
 * Disciplinary: one process, two types — conduct (misconduct) and capability
 * (poor performance). Concern raised → suspension if needed → investigation
 * → hearing invite → hearing → outcome → appeal → afterwards (warnings show
 * while active: 6 months for a first written, 12 for a final).
 *
 * Grievance: raised → acknowledged → meeting invite and meeting → an
 * investigation if needed → outcome → appeal.
 *
 * Pure: the case page, the list, the reminders and the file all read the
 * stage, the next deadline and the active warning from here.
 */

export type CaseKind = "disciplinary" | "grievance";

export const DISCIPLINARY_STAGES = [
  { key: "concern", label: "Concern raised" },
  { key: "investigation", label: "Investigation" },
  { key: "hearing", label: "Hearing" },
  { key: "outcome", label: "Outcome" },
  { key: "appeal", label: "Appeal" },
  { key: "closed", label: "Closed" },
] as const;

export const GRIEVANCE_STAGES = [
  { key: "raised", label: "Raised" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "meeting", label: "Meeting" },
  { key: "outcome", label: "Outcome" },
  { key: "appeal", label: "Appeal" },
  { key: "closed", label: "Closed" },
] as const;

export const stagesFor = (kind: string) => (kind === "grievance" ? GRIEVANCE_STAGES : DISCIPLINARY_STAGES);
export const stageLabel = (kind: string, stage: string) => stagesFor(kind).find((s) => s.key === stage)?.label ?? stage;
export const firstStage = (kind: CaseKind) => (kind === "grievance" ? "raised" : "concern");

export const DISCIPLINARY_OUTCOMES = [
  { value: "no_action", label: "No action" },
  { value: "first_written", label: "First written warning" },
  { value: "final_written", label: "Final written warning" },
  { value: "dismissal", label: "Dismissal" },
] as const;

export const GRIEVANCE_OUTCOMES = [
  { value: "upheld", label: "Upheld" },
  { value: "partly_upheld", label: "Partly upheld" },
  { value: "not_upheld", label: "Not upheld" },
] as const;

export const APPEAL_OUTCOMES = [
  { value: "not_upheld", label: "Appeal not upheld: the decision stands" },
  { value: "varied", label: "Appeal partly upheld: the decision is changed" },
  { value: "upheld", label: "Appeal upheld: the decision is overturned" },
] as const;

/** How an appeal decision reads in its letter: "my decision is that …". */
export const APPEAL_IN_LETTER: Record<string, string> = {
  not_upheld: "your appeal is not upheld, and the original decision stands",
  varied: "your appeal is partly upheld, and the decision is changed as set out below",
  upheld: "your appeal is upheld, and the original decision is overturned",
};

export const RECOMMENDATIONS = [
  { value: "hearing", label: "A hearing" },
  { value: "informal", label: "Dealt with informally" },
  { value: "no_case", label: "No case to answer" },
] as const;

const label = (list: ReadonlyArray<{ value: string; label: string }>, v: string | null | undefined) => list.find((x) => x.value === v)?.label ?? "—";
export const outcomeLabel = (v: string | null | undefined) => label([...DISCIPLINARY_OUTCOMES, ...GRIEVANCE_OUTCOMES], v);
export const appealLabel = (v: string | null | undefined) => label(APPEAL_OUTCOMES, v);
export const recommendationLabel = (v: string | null | undefined) => label(RECOMMENDATIONS, v);

export const kindLabel = (kind: string, subtype?: string | null) =>
  kind === "grievance" ? "Grievance" : subtype === "capability" ? "Capability" : "Disciplinary";

/** "DIS-2026-004", "GRV-2026-001", numbered per company, kind and year. */
export function caseRef(kind: CaseKind, year: number, n: number): string {
  return `${kind === "grievance" ? "GRV" : "DIS"}-${year}-${String(n).padStart(3, "0")}`;
}

export interface CaseSettings {
  warningFirstMonths: number;
  warningFinalMonths: number;
  hearingNoticeDays: number;
  appealDays: number;
  grievanceAckDays: number;
  officeAccess: string[];
}

export function caseSettingsFromRow(row: Record<string, unknown> | null | undefined): CaseSettings {
  const n = (k: string, d: number) => (typeof row?.[k] === "number" ? (row[k] as number) : d);
  return {
    warningFirstMonths: n("warning_first_months", 6),
    warningFinalMonths: n("warning_final_months", 12),
    hearingNoticeDays: n("hearing_notice_days", 5),
    appealDays: n("appeal_days", 5),
    grievanceAckDays: n("grievance_ack_days", 5),
    officeAccess: Array.isArray(row?.case_office_access) ? (row!.case_office_access as string[]) : [],
  };
}

export interface HrCase {
  id: string;
  kind: string;
  subtype: string | null;
  stage: string;
  user_id: string;
  raised_on: string;
  suspended_on: string | null;
  suspension_review_on: string | null;
  suspension_ended_on: string | null;
  hearing_on: string | null;
  invited_on: string | null;
  outcome: string | null;
  outcome_on: string | null;
  warning_expires_on: string | null;
  appeal_received_on: string | null;
  appeal_hearing_on: string | null;
  appeal_outcome: string | null;
  closed_on: string | null;
  dbs_referral: string;
  cqc_notice: string;
  la_notice: string;
}

/** When the warning stops showing as active, from the day of the outcome. */
export function warningExpiry(outcome: string, outcomeOn: string, s: Pick<CaseSettings, "warningFirstMonths" | "warningFinalMonths">, months?: number | null): string | null {
  if (outcome === "first_written") return addMonths(outcomeOn, months || s.warningFirstMonths);
  if (outcome === "final_written") return addMonths(outcomeOn, months || s.warningFinalMonths);
  return null;
}

/** A warning on record and still active: not expired, not overturned on appeal. */
export function activeWarning(c: Pick<HrCase, "outcome" | "warning_expires_on" | "appeal_outcome">, todayIso: string): boolean {
  if (c.outcome !== "first_written" && c.outcome !== "final_written") return false;
  if (c.appeal_outcome === "upheld") return false;
  return !!c.warning_expires_on && c.warning_expires_on >= todayIso;
}

/** An outcome that can be appealed (ACAS): a warning, a dismissal, or a grievance outcome. */
export const appealable = (c: Pick<HrCase, "kind" | "outcome">) => !!c.outcome && c.outcome !== "no_action";

export interface Deadline {
  on: string;
  what: string;
}

/** Every deadline still ahead of the case (or missed), soonest first. */
export function deadlines(c: HrCase, s: CaseSettings): Deadline[] {
  if (c.closed_on) return [];
  const out: Deadline[] = [];
  if (c.suspended_on && !c.suspension_ended_on && c.suspension_review_on) out.push({ on: c.suspension_review_on, what: "Review the suspension" });
  if (c.kind === "grievance" && c.stage === "raised") out.push({ on: addDays(c.raised_on, s.grievanceAckDays), what: "Acknowledge the grievance" });
  if (c.hearing_on && !c.outcome) {
    if (!c.invited_on) out.push({ on: addDays(c.hearing_on, -s.hearingNoticeDays), what: `Send the invite (${s.hearingNoticeDays} days' notice)` });
    out.push({ on: c.hearing_on, what: c.kind === "grievance" ? "The grievance meeting" : "The hearing" });
  }
  if (c.outcome && c.outcome_on && appealable(c) && !c.appeal_received_on) out.push({ on: addDays(c.outcome_on, s.appealDays), what: "The appeal window closes" });
  if (c.appeal_received_on && !c.appeal_outcome && c.appeal_hearing_on) out.push({ on: c.appeal_hearing_on, what: "The appeal hearing" });
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

export const nextDeadline = (c: HrCase, s: CaseSettings): Deadline | null => deadlines(c, s)[0] ?? null;

/** The legal duties to remind a manager of (HR-PACK.md, Legal reminders), as still to confirm. */
export function legalReminders(c: HrCase): string[] {
  const out: string[] = [];
  if (c.kind === "disciplinary" && c.outcome === "dismissal" && c.dbs_referral === "unknown") out.push("Decide whether a DBS barring referral is needed");
  if (c.dbs_referral === "needed") out.push("Make the DBS barring referral");
  if (c.cqc_notice === "needed") out.push("Tell CQC");
  if (c.la_notice === "needed") out.push("Tell the local authority safeguarding team");
  return out;
}

/** Whether the hearing date gives the notice the company set, counted from today. */
export function enoughNotice(hearingOn: string, todayIso: string, days: number): boolean {
  return hearingOn >= addDays(todayIso, days);
}
