/**
 * A performance plan as four steps, with the next thing to do. The same idea
 * as a complaint's steps (lib/complaints/steps.ts):
 *
 *   1 Plan set → 2 Carer signed → 3 Weekly reviews → 4 Outcome
 *
 * Nothing on a plan used to say what was owed next, so nothing was: plans sat
 * unsigned and were never closed. This says.
 *
 * Pure: no I/O.
 */

export type PipStepKey = "set" | "signed" | "reviews" | "outcome";

export interface PipStepsInput {
  status: string; // open | completed | cancelled
  kind?: string;
  carerName?: string;
  outcome?: string | null;
  reviewUntil?: string | null;
  carerSignedAt?: string | null;
  reviews?: { weekNumber: number; periodStart: string; periodEnd: string; completedAt?: string | null }[];
}

export interface PipStep {
  key: PipStepKey;
  n: number;
  title: string;
  state: "done" | "current" | "todo";
  /** e.g. "2 of 4" for the reviews. */
  detail?: string;
}

export interface PipNext { text: string; late?: boolean; step?: PipStepKey }

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const first = (name?: string) => (name || "").trim().split(/\s+/)[0] || "the carer";

export const PIP_OUTCOME_LABELS: Record<string, string> = { met: "standards met", partially_met: "partially met", not_met: "not met" };

export function pipSteps(pip: PipStepsInput, today: string): { steps: PipStep[]; next: PipNext } {
  const reviews = [...(pip.reviews ?? [])].sort((a, b) => a.weekNumber - b.weekNumber);
  const signedOff = reviews.filter((r) => r.completedAt).length;
  const allReviewed = reviews.length > 0 && signedOff === reviews.length;
  const finished = pip.status === "completed";

  const done: Record<PipStepKey, boolean> = {
    set: true, // a plan cannot exist without its reason and concerns
    signed: !!pip.carerSignedAt,
    reviews: allReviewed,
    outcome: finished,
  };

  // What to do now. A week left unreviewed is the most urgent thing on a
  // plan — it is the part that goes stale — so it comes before the signature.
  let next: PipNext;
  const overdue = reviews.find((r) => !r.completedAt && r.periodEnd < today);
  const running = reviews.find((r) => !r.completedAt);
  if (pip.status === "cancelled") next = { text: "This plan was cancelled." };
  else if (finished) next = { text: `Finished — ${PIP_OUTCOME_LABELS[pip.outcome || ""] || "outcome recorded"}.` };
  else if (overdue) next = { step: "reviews", late: true, text: `Review week ${overdue.weekNumber}. It ended ${shortDate(overdue.periodEnd)}.` };
  else if (!pip.carerSignedAt) next = { step: "signed", text: `Get ${first(pip.carerName)}'s signature — in their app, or in person at the office.` };
  else if (reviews.length === 0) next = { step: "reviews", text: "Add the first week, so the reviews can start." };
  else if (running) next = { step: "reviews", text: `Week ${running.weekNumber} runs to ${shortDate(running.periodEnd)}. Review it then.` };
  else next = { step: "outcome", late: !!pip.reviewUntil && today > pip.reviewUntil, text: "Every week is reviewed. Close the plan with its outcome." };

  const order: PipStepKey[] = ["set", "signed", "reviews", "outcome"];
  const titles: Record<PipStepKey, string> = { set: "Plan set", signed: "Carer signed", reviews: "Weekly reviews", outcome: "Outcome" };
  const steps: PipStep[] = order.map((key, i) => ({
    key,
    n: i + 1,
    title: titles[key],
    state: done[key] ? "done" : pip.status === "open" && next.step === key ? "current" : "todo",
    detail: key === "reviews" && reviews.length ? `${signedOff} of ${reviews.length}` : undefined,
  }));
  return { steps, next };
}
