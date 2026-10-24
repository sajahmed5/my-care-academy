/**
 * When a form stage counts as done.
 *
 * It used to be "anything typed": one answer turned the stage green, which is
 * how a Triage with every check still unowned read as finished. A stage is
 * done when every required question that is being asked has an answer — and
 * Triage only once each of its standing checks has an owner, or has been
 * marked not needed with a reason.
 *
 * Pure: the action supplies the answers and the titles of the stage's actions.
 */

import { visibleQuestions, hasAnswer, type AnswerMap, type StageForm } from "./schema";

/**
 * The checks every complaint gets at Triage. Each becomes an action with an
 * owner and a date, or is marked not needed with a reason; Triage is not done
 * until that is true of all five. The names are the process and are matched
 * on, so they are not reworded casually.
 */
export const TRIAGE_CHECKS = [
  "Obtain carer statement",
  "Review previous QAs",
  "Review spot-checks",
  "Review ECM data",
  "Review training records",
] as const;

/** The required questions, among those being asked, with no answer yet. */
export function requiredMissing(form: StageForm, answers: AnswerMap): string[] {
  return form.sections
    .flatMap((s) => visibleQuestions(s, answers))
    .filter((q) => q.required && !hasAnswer(answers[q.id]))
    .map((q) => q.text);
}

/**
 * A check the office decided this complaint does not need, with why. Kept on
 * the Triage answers beside the form's own, keyed by the check's name.
 */
export const TRIAGE_NA_KEY = "tri_checks_na";

/**
 * The actions Findings offers to take with the staff member. None is
 * required, but each one that does not apply is marked not needed with a
 * reason, so it stops sitting there waiting for an owner.
 */
export const FINDINGS_ACTIONS = [
  "Arrange retraining",
  "Start disciplinary process",
  "Arrange client visit & coaching",
  "Set up performance improvement plan",
  "Review ECM data for the upcoming 2 weeks",
  "Carry out a spot check on the carer",
] as const;

/** Findings actions marked not needed, kept on the Findings answers. */
export const FINDINGS_NA_KEY = "fin_actions_na";

function readNa(
  answers: Record<string, unknown> | null | undefined,
  key: string,
  names: readonly string[],
): Record<string, string> {
  const raw = answers?.[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const c of names) {
    const why = (raw as Record<string, unknown>)[c];
    if (typeof why === "string" && why.trim()) out[c] = why.trim();
  }
  return out;
}

/** The checks marked not needed, each with its reason. Tolerant of anything malformed. */
export function readTriageNa(answers: Record<string, unknown> | null | undefined): Record<string, string> {
  return readNa(answers, TRIAGE_NA_KEY, TRIAGE_CHECKS);
}

/** The Findings actions marked not needed, each with its reason. */
export function readFindingsNa(answers: Record<string, unknown> | null | undefined): Record<string, string> {
  return readNa(answers, FINDINGS_NA_KEY, FINDINGS_ACTIONS);
}

/** The standing check a name refers to, however it was typed. */
export function triageCheckNamed(name: string): (typeof TRIAGE_CHECKS)[number] | undefined {
  return TRIAGE_CHECKS.find((c) => c.toLowerCase() === name.trim().toLowerCase());
}

/** The Findings action a name refers to, however it was typed. */
export function findingsActionNamed(name: string): (typeof FINDINGS_ACTIONS)[number] | undefined {
  return FINDINGS_ACTIONS.find((c) => c.toLowerCase() === name.trim().toLowerCase());
}

/**
 * The standing checks still to be dealt with: no owner, and not marked not
 * needed with a reason. Given the titles of the live actions on Triage.
 */
export function triageChecksUnassigned(
  actionTitles: string[],
  notNeeded: Record<string, string> = {},
): string[] {
  const have = new Set(actionTitles.map((t) => t.trim().toLowerCase()));
  return TRIAGE_CHECKS.filter((c) => !have.has(c.toLowerCase()) && !notNeeded[c]);
}

export function formStageStatus(
  form: StageForm,
  answers: AnswerMap,
  triageActionTitles?: string[],
): "done" | "pending" {
  if (requiredMissing(form, answers).length > 0) return "pending";
  if (
    triageActionTitles &&
    triageChecksUnassigned(triageActionTitles, readTriageNa(answers as Record<string, unknown>)).length > 0
  ) {
    return "pending";
  }
  return "done";
}
