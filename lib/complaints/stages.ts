/**
 * The vocabulary of the process: what kinds of record there are, what a stage
 * can open, and the stages an organisation starts with.
 *
 * Pure: safe in client components.
 */

export type ComplaintKind = "complaint" | "safeguarding" | "issue";

export const COMPLAINT_KINDS: { value: ComplaintKind; label: string; plural: string; prefix: string; hint: string }[] = [
  { value: "complaint", label: "Complaint", plural: "Complaints", prefix: "COM", hint: "Investigated, with a written response" },
  { value: "safeguarding", label: "Safeguarding concern", plural: "Safeguarding", prefix: "SAF", hint: "May need a referral to the local authority" },
  { value: "issue", label: "Issue", plural: "Issues", prefix: "ISS", hint: "Put right, recorded and monitored" },
];

export const kindOf = (value: string | null | undefined): ComplaintKind =>
  value === "safeguarding" || value === "issue" ? value : "complaint";

export const kindLabel = (value: string) => COMPLAINT_KINDS.find((k) => k.value === value)?.label ?? value;

export type StageKind =
  | "document"
  | "complaint_form"
  | "acknowledgement"
  | "meeting_minutes"
  | "action_plan"
  | "outcome_letter"
  | "duty_of_candour"
  | "monitoring_review";

/**
 * What a stage opens. A stage whose kind is wrong falls back to the plain
 * documents panel, which reads as a missing feature — so the kind is shown
 * and editable where the stages are set up.
 */
export const STAGE_KINDS: { value: StageKind; label: string; hint: string }[] = [
  { value: "document", label: "Documents", hint: "Status plus file uploads" },
  { value: "complaint_form", label: "Complaint form", hint: "What was raised, by whom, about what" },
  { value: "acknowledgement", label: "Acknowledgement", hint: "The letter acknowledging the complaint, and when it went" },
  { value: "meeting_minutes", label: "Meeting", hint: "Triage, Findings or Follow-up, by the stage's name" },
  { value: "action_plan", label: "Action plan", hint: "An issue's findings and the actions agreed" },
  { value: "outcome_letter", label: "Outcome letter", hint: "What we found and what we will do, and when it went" },
  { value: "duty_of_candour", label: "Duty of candour letter", hint: "The letter, when it went, and to whom" },
  { value: "monitoring_review", label: "Monitoring review", hint: "What has changed, and whether it is resolved" },
];

export const stageKindLabel = (value: string) => STAGE_KINDS.find((k) => k.value === value)?.label ?? value;

export const COMPLAINT_STATUSES: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "cancelled", label: "Cancelled" },
];

export const statusLabel = (value: string) => COMPLAINT_STATUSES.find((s) => s.value === value)?.label ?? value;

export const RAISED_BY_ROLES: { value: string; label: string }[] = [
  { value: "client", label: "The person receiving care" },
  { value: "family", label: "A relative or representative" },
  { value: "social_worker", label: "A social worker or commissioner" },
  { value: "staff", label: "A member of staff" },
  { value: "other", label: "Someone else" },
];

/** The full written response is due this many days after the complaint reached us. */
export const RESPOND_WITHIN_DAYS = 28;

export function completeByFor(reportedOn: string): string {
  const d = new Date(`${reportedOn.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + RESPOND_WITHIN_DAYS);
  return d.toISOString().slice(0, 10);
}

const ALL: ComplaintKind[] = ["complaint", "safeguarding", "issue"];
const COM_SAF: ComplaintKind[] = ["complaint", "safeguarding"];

/**
 * The stages an organisation starts with. The order is the order the work
 * happens; sort_order is set from the index.
 *
 * Previous QAs, spot checks and training records are plain document stages
 * here: this platform holds training and competency, not visit data, and a
 * stage that looks things up in a roster this platform does not have would
 * be a cell that never fills.
 */
export const DEFAULT_STAGES: { name: string; kind: StageKind; appliesTo: ComplaintKind[] }[] = [
  { name: "Complaint Form", kind: "complaint_form", appliesTo: ALL },
  { name: "Triage", kind: "meeting_minutes", appliesTo: ALL },
  { name: "Acknowledgement", kind: "acknowledgement", appliesTo: ALL },
  { name: "Carer Statement", kind: "document", appliesTo: ALL },
  { name: "Action Plan", kind: "action_plan", appliesTo: ["issue"] },
  { name: "Monitoring Review", kind: "monitoring_review", appliesTo: ["issue"] },
  { name: "Previous QAs", kind: "document", appliesTo: COM_SAF },
  { name: "Spot Checks", kind: "document", appliesTo: COM_SAF },
  { name: "Training Records", kind: "document", appliesTo: COM_SAF },
  { name: "Client Visit", kind: "document", appliesTo: COM_SAF },
  { name: "Findings", kind: "meeting_minutes", appliesTo: COM_SAF },
  { name: "Follow-up", kind: "meeting_minutes", appliesTo: COM_SAF },
  { name: "Outcome Letter", kind: "outcome_letter", appliesTo: ALL },
  { name: "Duty of Candour Letter", kind: "duty_of_candour", appliesTo: ["complaint", "safeguarding"] },
  { name: "Council Correspondence", kind: "document", appliesTo: COM_SAF },
  { name: "Other", kind: "document", appliesTo: ALL },
];

export interface ComplaintStage {
  id: string;
  name: string;
  kind: string;
  appliesTo: string[];
  sortOrder: number;
  enabled: boolean;
}

/** The stages that apply to one kind of record, enabled and in order. */
export function stagesFor(stages: ComplaintStage[], kind: string): ComplaintStage[] {
  return stages
    .filter((s) => s.enabled && (s.appliesTo.length === 0 || s.appliesTo.includes(kind)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
