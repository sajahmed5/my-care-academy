/**
 * The vocabulary of the process: what kinds of record there are, what a stage
 * can open, and the stages an organisation starts with.
 *
 * Pure: safe in client components.
 */

/**
 * The five types a concern is triaged into (COMPLAINTS-SAFEGUARDING.md, agreed
 * 29 Oct 2026). Everything comes in through one front door as a concern; until
 * someone decides which of these it is, its kind is UNTRIAGED.
 */
export type ComplaintKind = "complaint" | "safeguarding" | "issue" | "accident" | "near_miss";
export type RecordKind = ComplaintKind | "concern";

/** Raised, not yet triaged. Its CON- reference is kept once it is. */
export const UNTRIAGED = "concern" as const;

export const COMPLAINT_KINDS: { value: ComplaintKind; label: string; plural: string; prefix: string; hint: string }[] = [
  { value: "complaint", label: "Complaint", plural: "Complaints", prefix: "COM", hint: "Investigated, with a written response in 28 days" },
  { value: "safeguarding", label: "Safeguarding concern", plural: "Safeguarding", prefix: "SAF", hint: "Someone may be at risk of abuse or neglect: keep them safe, refer to the council" },
  { value: "issue", label: "Issue", plural: "Issues", prefix: "ISS", hint: "Put right, recorded and monitored" },
  { value: "accident", label: "Accident", plural: "Accidents", prefix: "ACC", hint: "Someone was hurt: what happened, first aid, and whether RIDDOR applies" },
  { value: "near_miss", label: "Near miss", plural: "Near misses", prefix: "NM", hint: "Nobody was hurt, but could have been" },
];

export const isComplaintKind = (value: string | null | undefined): value is ComplaintKind =>
  COMPLAINT_KINDS.some((k) => k.value === value);

/** A record's kind, read safely: anything unknown is a complaint, as it always was. */
export const kindOf = (value: string | null | undefined): RecordKind =>
  value === UNTRIAGED ? UNTRIAGED : isComplaintKind(value) ? value : "complaint";

export const isUntriaged = (value: string | null | undefined) => value === UNTRIAGED;

export const kindLabel = (value: string) =>
  value === UNTRIAGED ? "Concern" : COMPLAINT_KINDS.find((k) => k.value === value)?.label ?? value;

/** The reference prefix for a new record: CON- until it is triaged. */
export const prefixFor = (value: string) =>
  value === UNTRIAGED ? "CON" : COMPLAINT_KINDS.find((k) => k.value === value)?.prefix ?? "COM";

export type StageKind =
  | "document"
  | "complaint_form"
  | "acknowledgement"
  | "meeting_minutes"
  | "action_plan"
  | "outcome_letter"
  | "duty_of_candour"
  | "monitoring_review"
  | "accident_report"
  | "near_miss_report"
  | "incident_actions"
  | "sg_immediate"
  | "sg_referral"
  | "sg_cqc"
  | "sg_police"
  | "sg_enquiry"
  | "sg_lessons";

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
  { value: "accident_report", label: "Accident report", hint: "What happened, who was hurt and how, first aid given" },
  { value: "near_miss_report", label: "Near miss report", hint: "What happened, and what would have happened" },
  { value: "incident_actions", label: "Actions and training", hint: "What is being done so it does not happen again" },
  { value: "sg_immediate", label: "Safeguarding: keeping them safe", hint: "The risk, and what was done straight away" },
  { value: "sg_referral", label: "Safeguarding: council referral", hint: "Whether it was referred, when, and the council's reference" },
  { value: "sg_cqc", label: "Safeguarding: CQC notification", hint: "Whether CQC was notified, and when" },
  { value: "sg_police", label: "Safeguarding: police", hint: "Whether a crime may have happened, and the crime reference" },
  { value: "sg_enquiry", label: "Safeguarding: council enquiry", hint: "The outcome of the council's Section 42 enquiry" },
  { value: "sg_lessons", label: "Safeguarding: lessons learned", hint: "What was learned, the actions, and any DBS referral" },
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
const INCIDENTS: ComplaintKind[] = ["accident", "near_miss"];
const SAF: ComplaintKind[] = ["safeguarding"];

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
  { name: "Triage", kind: "meeting_minutes", appliesTo: ["complaint", "issue"] },
  // Safeguarding has its own six (20261029213200), not the complaint's seven.
  { name: "Keeping Them Safe", kind: "sg_immediate", appliesTo: SAF },
  { name: "Council Referral", kind: "sg_referral", appliesTo: SAF },
  { name: "CQC Notification", kind: "sg_cqc", appliesTo: SAF },
  { name: "Police", kind: "sg_police", appliesTo: SAF },
  { name: "Acknowledgement", kind: "acknowledgement", appliesTo: ["complaint", "issue"] },
  { name: "Carer Statement", kind: "document", appliesTo: ALL },
  { name: "Action Plan", kind: "action_plan", appliesTo: ["issue"] },
  { name: "Monitoring Review", kind: "monitoring_review", appliesTo: ["issue"] },
  { name: "Previous QAs", kind: "document", appliesTo: ["complaint"] },
  { name: "Spot Checks", kind: "document", appliesTo: ["complaint"] },
  { name: "Training Records", kind: "document", appliesTo: ["complaint"] },
  { name: "Client Visit", kind: "document", appliesTo: ["complaint"] },
  { name: "Findings", kind: "meeting_minutes", appliesTo: ["complaint"] },
  { name: "Follow-up", kind: "meeting_minutes", appliesTo: ["complaint"] },
  { name: "Outcome Letter", kind: "outcome_letter", appliesTo: ["complaint", "issue"] },
  { name: "Duty of Candour Letter", kind: "duty_of_candour", appliesTo: ["complaint"] },
  { name: "Council Correspondence", kind: "document", appliesTo: COM_SAF },
  { name: "Council Enquiry Outcome", kind: "sg_enquiry", appliesTo: SAF },
  { name: "Lessons Learned", kind: "sg_lessons", appliesTo: SAF },
  { name: "Accident Report", kind: "accident_report", appliesTo: ["accident"] },
  { name: "Near Miss Report", kind: "near_miss_report", appliesTo: ["near_miss"] },
  { name: "Actions and Training", kind: "incident_actions", appliesTo: INCIDENTS },
  { name: "Other", kind: "document", appliesTo: [...ALL, ...INCIDENTS] },
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
