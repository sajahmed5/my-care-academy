/**
 * The one place a stage's status is worked out from what is on it, so the
 * save action and the screen agree.
 *
 *   form stages      every required visible question answered; Triage also
 *                    needs each standing check owned or marked not needed;
 *                    Findings (or an issue's action plan) also needs a
 *                    finding and a reason on every concern.
 *   letter stages    done once the letter has a sent date.
 *   document stages  whatever the office set — there is nothing to read.
 *
 * Pure: no I/O.
 */

import { formForStage, meetingNumber } from "./forms";
import { findingsOutstanding, readConcernFindings } from "./findings";
import { formStageStatus } from "./stage-status";
import type { AnswerMap } from "./schema";

export const LETTER_KINDS = new Set(["acknowledgement", "outcome_letter", "duty_of_candour"]);

export function isTriageStage(stage: { name: string; kind: string }): boolean {
  return stage.kind === "meeting_minutes" && meetingNumber(stage.name) === 1;
}

export function holdsFindings(stage: { name: string; kind: string }): boolean {
  return (stage.kind === "meeting_minutes" && meetingNumber(stage.name) === 2) || stage.kind === "action_plan";
}

/**
 * The tag an action agreed at this stage carries at the front of its detail,
 * which is how an action knows where it was agreed: "meeting:1" is Triage,
 * "meeting:2" Findings, "plan" the action plan.
 */
export function actionTagFor(stage: { name: string; kind: string }): string {
  return stage.kind === "action_plan" ? "plan" : isTriageStage(stage) ? "meeting:1" : holdsFindings(stage) ? "meeting:2" : "meeting:3";
}

/**
 * What a stage's status should be, given its answers. Returns null for a
 * document stage, whose status is set by hand and not derived.
 */
export function computeStageStatus(
  stage: { name: string; kind: string },
  answers: Record<string, unknown>,
  triageActionTitles: string[],
): "done" | "pending" | null {
  if (LETTER_KINDS.has(stage.kind)) {
    return typeof answers.sentOn === "string" && answers.sentOn ? "done" : "pending";
  }
  const form = formForStage(stage);
  if (!form) return null;
  const base = formStageStatus(form, answers as AnswerMap, isTriageStage(stage) ? triageActionTitles : undefined);
  if (base === "pending") return "pending";
  if (holdsFindings(stage) && findingsOutstanding(readConcernFindings(answers)).length > 0) return "pending";
  return "done";
}
