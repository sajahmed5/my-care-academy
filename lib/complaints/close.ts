/**
 * What still stands between a complaint and being closed.
 *
 * A record can be closed when every stage that applies to it is done or
 * marked not needed. "Not needed" is a decision someone made and can give a
 * reason for; an empty box is nobody's decision. Withdrawing or cancelling a
 * record is not closing it and is never held up by this.
 *
 * Pure: the action and the screen both ask it, so they cannot disagree.
 */

import { isOptionalStage, stepOfStage, type StepKey } from "./steps";

export interface CloseStage { id: string; name: string; kind: string }
export interface CloseEntry { stageId: string; status?: string | null }

export interface CloseGap { stageId: string; name: string; step: StepKey }

/** The stages still to do, in the order the work happens. Empty = it can be closed. */
export function closeGaps(stages: CloseStage[], entries: CloseEntry[]): CloseGap[] {
  const status = new Map(entries.map((e) => [e.stageId, e.status]));
  return stages
    .filter((s) => !isOptionalStage(s))
    .filter((s) => status.get(s.id) !== "done" && status.get(s.id) !== "na")
    .map((s) => ({ stageId: s.id, name: s.name, step: stepOfStage(s) }));
}

/**
 * Work that hangs off the record and must finish before it can be closed: a
 * performance plan started from it, and the actions agreed at Triage and
 * Findings or logged on the record.
 */
export interface CloseWork {
  /** Plans still running, e.g. "Performance plan for Jane Smith". */
  openPlans: string[];
  /** Actions not yet done, e.g. "Review training records — Sam Ilyas". */
  openActions: string[];
}

export const NO_CLOSE_WORK: CloseWork = { openPlans: [], openActions: [] };

const some = (names: string[], max: number) =>
  names.length > max ? `${names.slice(0, max).join("; ")} and ${names.length - max} more` : names.join("; ");

/** What to do before closing, as an alert or an error. Empty when it can be closed. */
export function closeGapsMessage(gaps: CloseGap[], untriaged = false, work: CloseWork = NO_CLOSE_WORK): string {
  if (untriaged) {
    return "This concern has not been triaged yet. Triage it first — that decides what it is and what it needs — or mark it withdrawn or cancelled.";
  }
  const parts: string[] = [];
  if (gaps.length) parts.push(`Still to do, or to mark as not needed: ${some(gaps.map((g) => g.name), 6)}.`);
  if (work.openActions.length) parts.push(`Actions not yet done: ${some(work.openActions, 5)}.`);
  if (work.openPlans.length) parts.push(`Still running: ${some(work.openPlans, 4)}. A plan is finished from inside it, with its outcome.`);
  return parts.length ? `This cannot be closed yet. ${parts.join(" ")}` : "";
}
