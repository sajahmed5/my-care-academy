/**
 * A complaint as a short path of steps, with the next thing to do.
 *
 * The stages an organisation has configured are unchanged; this only groups
 * them in the order the work happens and says where the record has got to:
 *
 *   1 Concern raised → 2 Triage → 3 Acknowledge → 4 Investigate →
 *   5 Findings → 6 Outcome → 7 Follow-up and close
 *
 * A step with no stages for this kind of record (an issue has no response
 * letter) is left out, and the rest are numbered without a gap.
 *
 * Pure: no I/O.
 */

import { meetingNumber } from "./forms";
import { acknowledgementState } from "./acknowledgement";
import { readTriageNa, triageChecksUnassigned } from "./stage-status";

export type StepKey = "raised" | "report" | "triage" | "acknowledge" | "investigate" | "findings" | "outcome" | "actions" | "close";

export interface StepStage { id: string; name: string; kind: string }
export interface StepEntry { stageId: string; status?: string | null; formAnswers?: Record<string, unknown> | null }

export interface ComplaintStep<S extends StepStage = StepStage> {
  key: StepKey;
  n: number;
  title: string;
  stages: S[];
  /** Stages that count towards the step and are done or not needed. */
  doneCount: number;
  /** Stages that count towards the step (an "Other" box never does). */
  total: number;
  state: "done" | "current" | "started" | "todo";
}

const TITLES: Record<StepKey, string> = {
  raised: "Concern raised",
  report: "What happened",
  triage: "Triage",
  acknowledge: "Acknowledge",
  investigate: "Investigate",
  findings: "Findings",
  outcome: "Outcome",
  actions: "Actions and training",
  close: "Follow-up and close",
};
// An accident or a near miss has only "What happened" and "Actions and
// training" of these, so the same list serves every type: a step with no
// stages for the record's type is left out.
const ORDER: StepKey[] = ["raised", "report", "triage", "acknowledge", "investigate", "findings", "outcome", "actions", "close"];

/**
 * The step a stage belongs to, from its kind. Kinds this project does not
 * offer (a carer statement, a generated review) still land where the work
 * happens, so a stage imported from elsewhere is placed and not lost.
 */
export function stepOfStage(stage: StepStage): StepKey {
  switch (stage.kind) {
    case "complaint_form": return "raised";
    case "acknowledgement": return "acknowledge";
    case "meeting_minutes": {
      const n = meetingNumber(stage.name);
      return n === 1 ? "triage" : n === 2 ? "findings" : "close";
    }
    case "action_plan": return "findings";
    case "outcome_letter":
    case "duty_of_candour":
    case "client_complaint_review":
    case "la_referral":
    case "cqc_notification": return "outcome";
    case "monitoring_review": return "close";
    case "accident_report":
    case "near_miss_report": return "report";
    case "incident_actions": return "actions";
    default: return "investigate"; // statements, evidence, documents
  }
}

/** "Other" is somewhere to put things, not something that has to be done. */
export const isOptionalStage = (s: StepStage) => s.kind === "document" && /^other$/i.test(s.name.trim());
const finished = (status?: string | null) => status === "done" || status === "na";

export function buildSteps<S extends StepStage>(stages: S[], entries: StepEntry[], closed: boolean): ComplaintStep<S>[] {
  const statusOf = (id: string) => entries.find((e) => e.stageId === id)?.status;
  const steps: ComplaintStep<S>[] = [];
  // A step holding nothing but "Other" (an accident has no investigation
  // stages) is not a step: its box moves to the end, beside closing.
  const spare: S[] = [];
  for (const key of ORDER) {
    let mine = stages.filter((s) => stepOfStage(s) === key);
    if (key !== "close" && mine.length > 0 && mine.every(isOptionalStage)) {
      spare.push(...mine);
      continue;
    }
    if (key === "close") mine = [...mine, ...spare];
    // The record is always closed at the end, whether or not a stage sits there.
    if (mine.length === 0 && key !== "close") continue;
    const counted = mine.filter((s) => !isOptionalStage(s));
    const doneCount = counted.filter((s) => finished(statusOf(s.id))).length;
    const allIn = doneCount === counted.length && (key !== "close" || closed);
    steps.push({ key, n: steps.length + 1, title: TITLES[key], stages: mine, doneCount, total: counted.length, state: allIn ? "done" : "todo" });
  }
  // The current step is the first not finished; a later one already begun is "started".
  const current = steps.find((s) => s.state !== "done");
  for (const s of steps) {
    if (s.state === "done") continue;
    s.state = s === current ? "current" : s.doneCount > 0 ? "started" : "todo";
  }
  return steps;
}

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export interface NextStep { text: string; step?: StepKey; late?: boolean }

/** One line saying what to do next on the record. */
export function nextStep(
  steps: ComplaintStep[],
  entries: StepEntry[],
  record: { reportedOn: string; completeBy?: string | null; closed: boolean },
  today: string,
  /** Titles of the live actions on Triage, where they are to hand: lets the line name the checks still open. */
  triageActionTitles?: string[],
): NextStep {
  if (record.closed) return { text: "This record is closed." };
  const cur = steps.find((s) => s.state === "current");
  if (!cur) return { text: "Everything is in. Close the record.", step: "close" };
  const statusOf = (id: string) => entries.find((e) => e.stageId === id)?.status;
  const open = cur.stages.filter((s) => !isOptionalStage(s) && !finished(statusOf(s.id)));
  const names = open.map((s) => s.name);
  const list = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
  switch (cur.key) {
    case "raised":
    case "report":
      return { step: cur.key, text: `Finish the ${names[0] || "form"}: some required answers are missing.` };
    case "actions":
      return { step: cur.key, text: "Say why it happened and what will stop it happening again, and give each action an owner and a date." };
    case "triage": {
      // Say what is actually missing once Triage has been started.
      const a = (entries.find((e) => e.stageId === cur.stages[0]?.id)?.formAnswers ?? {}) as Record<string, unknown>;
      const who = Array.isArray(a.mm1_attendees) ? a.mm1_attendees.length > 0 : !!String(a.mm1_attendees || "").trim();
      const bits = [
        ...(a.tri_type ? [] : ["decide what it is"]),
        ...(a.mm1_date && who ? [] : ["say when it was held and who took part"]),
      ];
      const started = !!a.tri_type || !!a.mm1_date || who;
      // "I have done everything, why is it still open?": name the checks
      // nobody owns rather than hinting that something is missing.
      const unowned = triageActionTitles ? triageChecksUnassigned(triageActionTitles, readTriageNa(a)) : [];
      if (started && unowned.length) {
        bits.push(`give ${unowned.length === 1 ? "this check" : "these checks"} an owner and a date, or mark ${unowned.length === 1 ? "it" : "them"} not needed: ${unowned.join(", ")}`);
      }
      return {
        step: cur.key,
        text: !started
          ? "Triage this concern: decide what it is, and give each check an owner and a date."
          : bits.length
            ? `Triage this concern: ${bits.join(", and ")}.`
            : "Triage this concern: give each check an owner and a date (or mark it not needed), and finish the required answers.",
      };
    }
    case "acknowledge": {
      const ack = cur.stages[0];
      const st = acknowledgementState(record.reportedOn, entries.find((e) => e.stageId === ack?.id)?.formAnswers ?? null, today);
      return st.overdue
        ? { step: cur.key, late: true, text: `Send the acknowledgement. It was due ${shortDate(st.dueBy)}.` }
        : { step: cur.key, text: `Send the acknowledgement by ${shortDate(st.dueBy)}.` };
    }
    case "investigate":
      return { step: cur.key, text: `Investigate: ${cur.doneCount} of ${cur.total} in. Still to come: ${list}.` };
    case "findings":
      return { step: cur.key, text: `Record the findings${names.length ? ` (${list})` : ""}.` };
    case "outcome": {
      const late = !!record.completeBy && today > record.completeBy;
      return { step: cur.key, late, text: `Write the outcome${names.length ? `: ${list}` : ""}${record.completeBy ? `. The response ${late ? "was" : "is"} due ${shortDate(record.completeBy)}` : ""}.` };
    }
    default:
      return open.length
        ? { step: cur.key, text: `Hold the follow-up (${list}), then close the record.` }
        : { step: cur.key, text: "Everything is in. Close the record." };
  }
}
