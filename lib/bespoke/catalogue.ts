/**
 * What a bespoke report can be built from (BESPOKE-REPORTS.md): each source
 * is one kind of record — an assignment, a certificate, a supervision — with
 * the fields the builder can show, filter, sort and group by.
 *
 * Pure, so the builder (a client component) and the renderer share one list.
 * The loaders that read each source live in lib/bespoke/load.ts; a source
 * whose feature the company's package leaves out is reported as such rather
 * than as empty, as the evidence pack does.
 */

import type { FeatureKey } from "@/lib/features";
import { SUPERVISION_KINDS } from "@/lib/supervisions";
import { COMPETENCY_AREAS, COMPETENCY_OUTCOMES, SPOT_CHECK_OUTCOMES } from "@/lib/competency";
import { COMPLAINT_KINDS, COMPLAINT_STATUSES, RAISED_BY_ROLES } from "@/lib/complaints/stages";
import { CONCERN_CATEGORIES } from "@/lib/complaints/categories";
import { AUDIT_KINDS } from "@/lib/audits";
import { FUNDER_TYPES } from "@/lib/clients";
import { STAFF_DOCS } from "@/lib/staff-documents";

export type FieldType = "text" | "number" | "date" | "bool" | "enum";

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** For an enum: the values and how they read. */
  options?: readonly Option[];
}

export interface SourceDef {
  key: string;
  label: string;
  /** One row is… */
  row: string;
  /** The package feature it needs; null for what every package has. */
  feature: FeatureKey | null;
  /** The date a report period applies to, if any. */
  periodField: string | null;
  fields: FieldDef[];
  /** Shown when a section is first made from this source. */
  defaultColumns: string[];
}

const ROLES: Option[] = [
  { value: "learner", label: "Carer" },
  { value: "org_office", label: "Office" },
  { value: "org_admin", label: "Manager" },
];
const ACTIVE: Option[] = [
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
];
const ENROLMENT_STATUSES: Option[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
];
const CERT_STATES: Option[] = [
  { value: "valid", label: "Valid" },
  { value: "expiring", label: "Expires within 60 days" },
  { value: "expired", label: "Expired" },
  { value: "no_expiry", label: "Doesn't expire" },
];
const CANDIDATE_STATUSES: Option[] = [
  { value: "candidate", label: "In progress" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Not taken on" },
];
const PLAN_KINDS: Option[] = [
  { value: "pip", label: "Performance plan" },
  { value: "disciplinary", label: "Disciplinary" },
];
const PLAN_STATUSES: Option[] = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
const PLAN_OUTCOMES: Option[] = [
  { value: "met", label: "Met" },
  { value: "partially_met", label: "Partly met" },
  { value: "not_met", label: "Not met" },
];
const CLIENT_STATUSES: Option[] = [
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
];
const DOC_STATES: Option[] = [
  { value: "held", label: "Held" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "not_required", label: "Not required" },
];

const opts = (list: readonly { value: string; label: string }[]): Option[] => list.map((o) => ({ value: o.value, label: o.label }));

const PERSON: FieldDef[] = [
  { key: "person", label: "Name", type: "text" },
  { key: "person_role", label: "Role", type: "enum", options: ROLES },
  { key: "person_status", label: "Account", type: "enum", options: ACTIVE },
];

export const SOURCES: SourceDef[] = [
  {
    key: "staff",
    label: "Staff",
    row: "one member of staff",
    feature: null,
    periodField: "joined",
    fields: [
      { key: "person", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "person_role", label: "Role", type: "enum", options: ROLES },
      { key: "person_status", label: "Account", type: "enum", options: ACTIVE },
      { key: "joined", label: "Added", type: "date" },
      { key: "last_seen", label: "Last signed in", type: "date" },
      { key: "assigned", label: "Courses assigned", type: "number" },
      { key: "completed", label: "Courses completed", type: "number" },
      { key: "overdue", label: "Courses overdue", type: "number" },
      { key: "percent_complete", label: "% complete", type: "number" },
    ],
    defaultColumns: ["person", "person_role", "assigned", "completed", "overdue", "percent_complete"],
  },
  {
    key: "training",
    label: "Training assignments",
    row: "one course assigned to one person",
    feature: null,
    periodField: "assigned_at",
    fields: [
      ...PERSON,
      { key: "course", label: "Course", type: "text" },
      { key: "status", label: "Status", type: "enum", options: ENROLMENT_STATUSES },
      { key: "overdue", label: "Overdue", type: "bool" },
      { key: "progress", label: "Progress %", type: "number" },
      { key: "assigned_at", label: "Assigned", type: "date" },
      { key: "due_date", label: "Due", type: "date" },
      { key: "time_spent", label: "Minutes spent", type: "number" },
      { key: "completions", label: "Times completed", type: "number" },
    ],
    defaultColumns: ["person", "course", "status", "due_date", "overdue"],
  },
  {
    key: "certificates",
    label: "Certificates",
    row: "one certificate",
    feature: null,
    periodField: "issued_at",
    fields: [
      ...PERSON,
      { key: "course", label: "Course", type: "text" },
      { key: "number", label: "Certificate number", type: "text" },
      { key: "issued_at", label: "Issued", type: "date" },
      { key: "expires_at", label: "Expires", type: "date" },
      { key: "state", label: "State", type: "enum", options: CERT_STATES },
      { key: "latest", label: "Latest for this course", type: "bool" },
    ],
    defaultColumns: ["person", "course", "issued_at", "expires_at", "state"],
  },
  {
    key: "classroom",
    label: "Classroom attendance",
    row: "one person at one classroom session",
    feature: "training.classroom",
    periodField: "held_on",
    fields: [
      ...PERSON,
      { key: "session", label: "Session", type: "text" },
      { key: "course", label: "Course", type: "text" },
      { key: "held_on", label: "Held on", type: "date" },
      { key: "trainer", label: "Trainer", type: "text" },
      { key: "practical_passed", label: "Practical passed", type: "bool" },
    ],
    defaultColumns: ["person", "session", "held_on", "trainer"],
  },
  {
    key: "supervisions",
    label: "Supervisions & appraisals",
    row: "one supervision, appraisal or review",
    feature: "people.supervisions",
    periodField: "held_on",
    fields: [
      ...PERSON,
      { key: "kind", label: "Kind", type: "enum", options: opts(SUPERVISION_KINDS) },
      { key: "held_on", label: "Held on", type: "date" },
      { key: "next_due", label: "Next due", type: "date" },
      { key: "supervisor", label: "Held by", type: "text" },
      { key: "signed", label: "Signed by the carer", type: "bool" },
    ],
    defaultColumns: ["person", "kind", "held_on", "next_due", "supervisor"],
  },
  {
    key: "spot_checks",
    label: "Spot checks",
    row: "one spot check",
    feature: "people.competency",
    periodField: "checked_on",
    fields: [
      ...PERSON,
      { key: "client", label: "Client", type: "text" },
      { key: "checked_on", label: "Checked on", type: "date" },
      { key: "outcome", label: "Outcome", type: "enum", options: opts(SPOT_CHECK_OUTCOMES) },
      { key: "next_due", label: "Next due", type: "date" },
      { key: "assessor", label: "Checked by", type: "text" },
    ],
    defaultColumns: ["person", "client", "checked_on", "outcome", "next_due"],
  },
  {
    key: "competency",
    label: "Competency assessments",
    row: "one competency assessment",
    feature: "people.competency",
    periodField: "checked_on",
    fields: [
      ...PERSON,
      { key: "area", label: "Skill", type: "enum", options: opts(COMPETENCY_AREAS) },
      { key: "outcome", label: "Outcome", type: "enum", options: opts(COMPETENCY_OUTCOMES) },
      { key: "checked_on", label: "Assessed on", type: "date" },
      { key: "next_due", label: "Next due", type: "date" },
      { key: "assessor", label: "Assessed by", type: "text" },
    ],
    defaultColumns: ["person", "area", "outcome", "checked_on", "next_due"],
  },
  {
    key: "plans",
    label: "Performance plans",
    row: "one performance plan or disciplinary",
    feature: "people.performance_plans",
    periodField: "start_date",
    fields: [
      ...PERSON,
      { key: "kind", label: "Kind", type: "enum", options: PLAN_KINDS },
      { key: "status", label: "Status", type: "enum", options: PLAN_STATUSES },
      { key: "start_date", label: "Started", type: "date" },
      { key: "review_until", label: "Review until", type: "date" },
      { key: "outcome", label: "Outcome", type: "enum", options: PLAN_OUTCOMES },
    ],
    defaultColumns: ["person", "kind", "status", "start_date", "outcome"],
  },
  {
    key: "audits",
    label: "Service audits",
    row: "one audit",
    feature: "quality.audits",
    periodField: "held_on",
    fields: [
      { key: "kind", label: "Audit", type: "enum", options: AUDIT_KINDS.map((k) => ({ value: k.key, label: k.label })) },
      { key: "subject", label: "Subject", type: "text" },
      { key: "held_on", label: "Held on", type: "date" },
      { key: "score", label: "Score %", type: "number" },
      { key: "next_due", label: "Next due", type: "date" },
      { key: "auditor", label: "Auditor", type: "text" },
    ],
    defaultColumns: ["kind", "subject", "held_on", "score", "next_due"],
  },
  {
    key: "concerns",
    label: "Complaints & concerns",
    row: "one complaint, safeguarding, issue, accident or near miss",
    feature: "complaints.register",
    periodField: "reported_on",
    fields: [
      { key: "reference", label: "Reference", type: "text" },
      {
        key: "kind",
        label: "Kind",
        type: "enum",
        options: [{ value: "concern", label: "Not yet triaged" }, ...opts(COMPLAINT_KINDS)],
      },
      { key: "status", label: "Status", type: "enum", options: opts(COMPLAINT_STATUSES) },
      { key: "category", label: "Category", type: "enum", options: opts(CONCERN_CATEGORIES) },
      { key: "reported_on", label: "Reported", type: "date" },
      { key: "occurred_on", label: "Happened", type: "date" },
      { key: "complete_by", label: "Respond by", type: "date" },
      { key: "closed_on", label: "Closed", type: "date" },
      { key: "about", label: "About", type: "text" },
      { key: "raised_by_role", label: "Raised by", type: "enum", options: opts(RAISED_BY_ROLES) },
      { key: "client", label: "Client", type: "text" },
      { key: "days_open", label: "Days open", type: "number" },
    ],
    defaultColumns: ["reference", "kind", "category", "reported_on", "status"],
  },
  {
    key: "compliments",
    label: "Compliments",
    row: "one compliment",
    feature: "complaints.register",
    periodField: "received_on",
    fields: [
      { key: "received_on", label: "Received", type: "date" },
      { key: "from", label: "From", type: "text" },
      { key: "from_role", label: "Who they are", type: "text" },
      { key: "client", label: "Client", type: "text" },
      { key: "what_was_said", label: "What was said", type: "text" },
    ],
    defaultColumns: ["received_on", "from", "client", "what_was_said"],
  },
  {
    key: "recruitment",
    label: "Recruitment",
    row: "one applicant",
    feature: "recruitment.tracker",
    periodField: "entry_date",
    fields: [
      { key: "name", label: "Applicant", type: "text" },
      { key: "role_applied", label: "Role applied for", type: "text" },
      { key: "source", label: "Where they heard of us", type: "text" },
      { key: "stage", label: "Stage", type: "text" },
      { key: "status", label: "Status", type: "enum", options: CANDIDATE_STATUSES },
      { key: "entry_date", label: "Applied", type: "date" },
      { key: "hired_at", label: "Hired", type: "date" },
      { key: "rejected_at", label: "Not taken on", type: "date" },
      { key: "start_date", label: "Start date", type: "date" },
      { key: "is_driver", label: "Driver", type: "bool" },
      { key: "days_to_hire", label: "Days to hire", type: "number" },
    ],
    defaultColumns: ["name", "role_applied", "source", "status", "entry_date"],
  },
  {
    key: "staff_documents",
    label: "Staff documents",
    row: "one document on a staff file",
    feature: "recruitment.tracker",
    periodField: "expires_at",
    fields: [
      ...PERSON,
      {
        key: "document",
        label: "Document",
        type: "enum",
        options: [
          ...STAFF_DOCS.map((d) => ({ value: d.key, label: d.label })),
          { value: "proof_id", label: "Proof of ID" },
          { value: "driving_licence", label: "Driving licence" },
          { value: "dbs_risk_assessment", label: "DBS risk assessment" },
        ],
      },
      { key: "expires_at", label: "Expires", type: "date" },
      { key: "state", label: "State", type: "enum", options: DOC_STATES },
    ],
    defaultColumns: ["person", "document", "expires_at", "state"],
  },
  {
    key: "clients",
    label: "Clients",
    row: "one client",
    feature: "clients.list",
    periodField: "start_date",
    fields: [
      { key: "name", label: "Client", type: "text" },
      { key: "region", label: "Region", type: "text" },
      { key: "postcode", label: "Postcode", type: "text" },
      { key: "funder_type", label: "Funded by", type: "enum", options: opts(FUNDER_TYPES) },
      { key: "funder_name", label: "Funder", type: "text" },
      { key: "medication_support", label: "Medication support", type: "bool" },
      { key: "start_date", label: "Started", type: "date" },
      { key: "status", label: "Status", type: "enum", options: CLIENT_STATUSES },
      { key: "age", label: "Age", type: "number" },
    ],
    defaultColumns: ["name", "region", "funder_type", "medication_support", "status"],
  },
];

export function sourceDef(key: string): SourceDef | undefined {
  return SOURCES.find((s) => s.key === key);
}

export function fieldDef(source: SourceDef, key: string): FieldDef | undefined {
  return source.fields.find((f) => f.key === key);
}

/** How a stored enum value reads. */
export function optionLabel(field: Pick<FieldDef, "options">, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}
