/**
 * Recruitment in four stages (RECRUITMENT.md, agreed with Saj 29 Oct 2026),
 * brought across from MyRoster's src/lib/recruitment/steps.ts.
 *
 * ONE set of functions says where a candidate is: the tracker, the
 * candidate's page and the hire check all read it, so they can never
 * disagree. A step's state comes from its row in candidate_documents (with or
 * without a file); the company's settings decide which steps apply.
 *
 * Pure: no I/O, so it is tested directly.
 */

export type Stage = 1 | 2 | 3 | 4;

export const STAGES: { stage: Stage; label: string; short: string }[] = [
  { stage: 1, label: "Application", short: "Application" },
  { stage: 2, label: "Interview", short: "Interview" },
  { stage: 3, label: "Checks", short: "Checks" },
  { stage: 4, label: "Sign-up", short: "Sign-up" },
];

export interface StepDef {
  key: string;
  stage: Stage;
  label: string;
  /** One line under the name: what's wanted. */
  hint: string;
  /** Optional steps: why it might not apply. */
  optionalNote?: string;
  /** Asks for an expiry date alongside the file. */
  tracksExpiry?: boolean;
  /** A company can switch this step off in its settings. */
  canSwitchOff?: boolean;
  /** The candidate uploads this themselves, from their own page. */
  candidateUploads?: boolean;
}

/**
 * Every step, in the order the office works through them. The conditional
 * ones (share code, third reference, DBS risk assessment) are listed always
 * and decided per candidate by stepsFor().
 */
export const RECRUITMENT_STEPS: StepDef[] = [
  { key: "application", stage: 1, label: "Application form", hint: "Their application, with ten years of work history and gaps explained." },
  { key: "literacy", stage: 1, label: "Literacy test", hint: "20 minutes, 80% to pass." },

  { key: "interview", stage: 2, label: "Interview", hint: "The interview record and overall score." },
  { key: "offer", stage: 2, label: "Conditional offer", hint: "The offer letter, sent after a successful interview." },

  { key: "starter_form", stage: 3, label: "Health, equality and DBS form", hint: "Filled in after the offer: health questions can't be asked before one.", canSwitchOff: true },
  { key: "proof_id", stage: 3, candidateUploads: true, label: "Proof of ID", hint: "Passport or photo driving licence." },
  { key: "proof_address_1", stage: 3, candidateUploads: true, label: "Proof of address 1", hint: "A bank statement or utility bill from the last 3 months." },
  { key: "proof_address_2", stage: 3, candidateUploads: true, label: "Proof of address 2", hint: "A second one, from a different source." },
  { key: "proof_ni", stage: 3, candidateUploads: true, label: "Proof of National Insurance number", hint: "A payslip, P60 or HMRC letter." },
  { key: "share_code", stage: 3, candidateUploads: true, label: "Right to work share code", hint: "The Home Office check result.", optionalNote: "only without a UK or Irish passport", tracksExpiry: true },
  { key: "reference_1", stage: 3, label: "Reference 1", hint: "From their most recent employer." },
  { key: "reference_2", stage: 3, label: "Reference 2", hint: "A second employer, or a character reference." },
  { key: "reference_3", stage: 3, label: "Reference 3", hint: "Needed if they've never been employed, or if your company asks for three.", optionalNote: "only if never employed" },
  { key: "dbs", stage: 3, candidateUploads: true, label: "DBS", hint: "The enhanced DBS certificate, or the Update Service check.", tracksExpiry: true },
  { key: "dbs_risk_assessment", stage: 3, label: "DBS risk assessment", hint: "Because the DBS shows a conviction." },
  { key: "training", stage: 3, label: "Training organised", hint: "Their induction booked." },

  { key: "role_acceptance", stage: 4, label: "Role acceptance", hint: "The job description and code of conduct, signed." },
  { key: "contract", stage: 4, label: "Contract", hint: "Signed by them and by you." },
  { key: "refund_training", stage: 4, label: "Refund of training agreement", hint: "Signed.", canSwitchOff: true },
  { key: "shadowing", stage: 4, label: "Shadowing", hint: "The mentor's feedback after shadowing.", canSwitchOff: true },
];

export function stepDef(key: string): StepDef | undefined {
  return RECRUITMENT_STEPS.find((s) => s.key === key);
}

/** The label for a step key, including the keys of the old checklist. */
export function docLabel(key: string): string {
  const legacy: Record<string, string> = {
    proof_address: "Proof of address",
    right_to_work: "Right to work",
    references: "References",
  };
  return stepDef(key)?.label ?? legacy[key] ?? key;
}

export interface RecruitmentSettings {
  stagesInOrder: boolean;
  stepsOff: string[];
  thirdReference: boolean;
  dbsBeforeStart: boolean;
}

export const DEFAULT_SETTINGS: RecruitmentSettings = {
  stagesInOrder: true,
  stepsOff: [],
  thirdReference: false,
  dbsBeforeStart: true,
};

export function settingsFromRow(row: Record<string, unknown> | null | undefined): RecruitmentSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    stagesInOrder: row.stages_in_order !== false,
    stepsOff: Array.isArray(row.steps_off) ? (row.steps_off as string[]) : [],
    thirdReference: row.third_reference === true,
    dbsBeforeStart: row.dbs_before_start !== false,
  };
}

/** What the database holds for one step. */
export interface CandidateDocRecord {
  doc_type: string;
  file_path: string | null;
  expires_at: string | null;
  not_required: boolean;
  review_status?: "submitted" | "sent_back" | "confirmed" | null;
  review_note?: string | null;
}

export type StepState = "not_started" | "submitted" | "sent_back" | "confirmed" | "not_needed" | "expired";

export interface CandidateFacts {
  dbsConviction: boolean;
}

/** Which steps apply to this candidate, and whether each is required. */
export function stepsFor(settings: RecruitmentSettings, facts: CandidateFacts): (StepDef & { required: boolean })[] {
  return RECRUITMENT_STEPS.filter((s) => !(s.canSwitchOff && settings.stepsOff.includes(s.key)))
    .filter((s) => s.key !== "dbs_risk_assessment" || facts.dbsConviction)
    .map((s) => ({
      ...s,
      required:
        s.key === "share_code"
          ? false
          : s.key === "reference_3"
            ? settings.thirdReference
            : true,
    }));
}

/** Today as YYYY-MM-DD in local time, for comparing with a date column. */
export function isoToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function stepState(doc: CandidateDocRecord | undefined, today = isoToday()): StepState {
  if (!doc) return "not_started";
  if (doc.not_required) return "not_needed";
  const status = doc.review_status ?? "confirmed";
  if (status === "submitted") return "submitted";
  if (status === "sent_back") return "sent_back";
  if (doc.expires_at && doc.expires_at < today) return "expired";
  return "confirmed";
}

export const isDone = (s: StepState) => s === "confirmed" || s === "not_needed";

export interface ResolvedStep extends StepDef {
  required: boolean;
  state: StepState;
  doc?: CandidateDocRecord;
  /** Locked because an earlier stage isn't finished and stages go in order. */
  locked: boolean;
}

export interface StageProgress {
  stage: Stage;
  label: string;
  steps: ResolvedStep[];
  done: number;
  total: number;
  complete: boolean;
  locked: boolean;
}

/**
 * Where a candidate is: each stage with its steps and their state. A stage is
 * complete when every required step in it is confirmed or not needed (the DBS
 * excepted when the company lets people start before it's back). With stages
 * in order, a stage stays locked until every stage before it is complete.
 */
export function progress(
  docs: CandidateDocRecord[],
  settings: RecruitmentSettings,
  facts: CandidateFacts,
  today = isoToday(),
): StageProgress[] {
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  const steps = stepsFor(settings, facts);
  let earlierIncomplete = false;
  return STAGES.map(({ stage, label }) => {
    const locked = settings.stagesInOrder && earlierIncomplete;
    const resolved: ResolvedStep[] = steps
      .filter((s) => s.stage === stage)
      .map((s) => ({ ...s, state: stepState(byType.get(s.key), today), doc: byType.get(s.key), locked }));
    const counted = resolved.filter((s) => s.required);
    const done = counted.filter((s) => isDone(s.state)).length;
    const complete = counted.every((s) => isDone(s.state) || dbsCanFollow(s, settings));
    if (!complete) earlierIncomplete = true;
    return { stage, label, steps: resolved, done, total: counted.length, complete, locked };
  });
}

/** The stage they're on: the first one not complete, or 4 when all are. */
export function currentStage(stages: StageProgress[]): Stage {
  return stages.find((s) => !s.complete)?.stage ?? 4;
}

/** A DBS still to come that doesn't hold up a start, when the company allows that. */
function dbsCanFollow(step: ResolvedStep, settings: RecruitmentSettings): boolean {
  return step.key === "dbs" && !settings.dbsBeforeStart && step.state !== "expired";
}

/** What's still standing between a candidate and being hired. */
export function outstandingSteps(stages: StageProgress[], settings: RecruitmentSettings): ResolvedStep[] {
  return stages.flatMap((s) =>
    s.steps.filter((step) => step.required && !isDone(step.state) && !dbsCanFollow(step, settings)),
  );
}

export function readyToHire(stages: StageProgress[]): boolean {
  return stages.every((s) => s.complete);
}

/** The refusal a manager reads when Hire is pressed too soon. */
export function notReadyMessage(outstanding: ResolvedStep[]): string {
  const labels = outstanding.map((s) => (s.state === "expired" ? `${s.label} (expired)` : s.label));
  return `Not ready to hire. Still to do: ${labels.join(", ")}.`;
}

/** Who the next move is with, for the tracker's last column. */
export function nextMove(stages: StageProgress[]): { who: "us" | "them" | "done"; text: string } {
  const open = stages.flatMap((s) => (s.locked ? [] : s.steps.filter((st) => st.required && !isDone(st.state))));
  const review = open.find((s) => s.state === "submitted");
  if (review) return { who: "us", text: `Review ${review.label.toLowerCase()}` };
  const sentBack = open.find((s) => s.state === "sent_back");
  if (sentBack) return { who: "them", text: `${sentBack.label}: sent back` };
  const next = open.find((s) => s.state === "not_started" || s.state === "expired");
  if (next) return { who: "us", text: next.label };
  return { who: "done", text: "Ready to hire" };
}

/** Where a candidate is, as one word, for the tracker's filters. */
export type CandidateProgress = "in_progress" | "hired" | "rejected";

export function progressOf(c: { status: string }): CandidateProgress {
  if (c.status === "hired") return "hired";
  if (c.status === "rejected") return "rejected";
  return "in_progress";
}

/** Where people heard about the job, offered when adding a candidate. */
export const SOURCES = ["Indeed", "Facebook", "Referral", "Our website", "Job centre", "Walk-in", "Other"];

/** The roles people apply for, offered when adding a candidate. */
export const ROLES = ["Care assistant", "Senior carer", "Care coordinator", "Office staff"];
