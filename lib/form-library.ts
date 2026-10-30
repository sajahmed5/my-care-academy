/**
 * The forms library: forms we author, organisations assign, carers complete.
 *
 * The same shape as the policies library, deliberately. A template is ours,
 * published by the platform and filed in a category; an organisation sees the
 * ones its packs include; it asks a person to complete one by a date; the
 * person does, on their own login, and the response is evidence.
 *
 * Fields reuse lib/forms.ts's FormField — the builder's model — so the fill-in
 * UI and the visibility rules are the same code the builder already runs.
 *
 * Pure except for the loaders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isFieldVisible, type FormField } from "./forms";
import { formatDate } from "./dates";

export const FORM_CATEGORIES = [
  { value: "recruitment", label: "Recruitment" },
  { value: "quality", label: "Quality" },
  { value: "review", label: "Reviews" },
  { value: "care", label: "Care" },
  { value: "hr", label: "HR" },
  { value: "other", label: "Other" },
] as const;

export type FormCategory = (typeof FORM_CATEGORIES)[number]["value"];

export function categoryLabel(value: string): string {
  return FORM_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export type FormPack = "basic" | "full" | "addon";

/**
 * Who a form is about, and so who fills it in (FORMS.md, 29 Oct 2026).
 * A carer form is asked of a member of staff and completed on their own
 * login; a client form is filled in by the office about a client, who or
 * whose family can sign it on the device; a company form is about the
 * business, not a person.
 */
export const FORM_AUDIENCES = [
  { value: "client", label: "Client forms", hint: "Filled in by the office about a client. The client or family can sign on the device, and it shows on the client page." },
  { value: "carer", label: "Carer forms", hint: "Asked of a member of staff, who fills it in on their own login. It is kept on their file." },
  { value: "company", label: "Company forms", hint: "About the business, not a person." },
] as const;

export type FormAudience = (typeof FORM_AUDIENCES)[number]["value"];

export function audienceOf(value: unknown): FormAudience {
  return value === "client" || value === "company" ? value : "carer";
}

export interface FormTemplateSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  pack: FormPack;
  audience: FormAudience;
  collection: string | null;
  service_types: string[] | null;
  version: number;
  status: string;
  /** Months until a completed one is due for review; null if never reviewed. */
  review_months: number | null;
  /** A log: a line added each time, read as one table (FORMS.md). */
  is_log: boolean;
  /** What a log's "who" column is called: "Checked by", "Champion". */
  log_person_label: string | null;
  /** Set on a company's own form; null for ours. */
  organisation_id: string | null;
  /** On a company's copy: the library form it came from, and that form's version then. */
  based_on_id: string | null;
  based_on_version: number | null;
  /** Null when the template was read for a list, without its fields. */
  fieldCount: number | null;
}

export interface FormTemplateRecord extends FormTemplateSummary {
  fields: FormField[];
}

/**
 * Which packs an organisation's forms come from.
 *
 * forms.builder is the gate for the library as a whole. Add-on packs follow
 * the feature they belong to: the recruitment forms arrive with the
 * recruitment tracker, because they are the paper half of the same thing.
 */
export function visibleFormPacks(enabled: Record<string, boolean>): {
  packs: FormPack[];
  collections: string[];
} {
  if (!enabled["forms.builder"]) return { packs: [], collections: [] };
  const packs: FormPack[] = ["basic", "full"];
  const collections: string[] = [];
  if (enabled["complaints.register"]) collections.push("Complaints and Safeguarding Pack");
  if (enabled["recruitment.tracker"]) collections.push("Recruitment Pack");
  if (collections.length) packs.push("addon");
  return { packs, collections };
}

function appliesTo(serviceTypes: string[] | null, orgServiceType: string | null): boolean {
  if (!serviceTypes || serviceTypes.length === 0) return true;
  if (!orgServiceType || orgServiceType === "both") return true;
  return serviceTypes.includes(orgServiceType);
}

export function toSummary(r: Record<string, unknown>): FormTemplateSummary {
  return {
    id: r.id as string,
    code: r.code as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    category: r.category as string,
    pack: r.pack as FormPack,
    audience: audienceOf(r.audience),
    collection: (r.collection as string | null) ?? null,
    service_types: (r.service_types as string[] | null) ?? null,
    version: (r.version as number) ?? 1,
    status: (r.status as string) ?? "draft",
    review_months: (r.review_months as number | null) ?? null,
    is_log: r.is_log === true,
    log_person_label: (r.log_person_label as string | null) ?? null,
    organisation_id: (r.organisation_id as string | null) ?? null,
    based_on_id: (r.based_on_id as string | null) ?? null,
    based_on_version: (r.based_on_version as number | null) ?? null,
    fieldCount: Array.isArray(r.fields) ? (r.fields as unknown[]).length : null,
  };
}

export const SUMMARY_COLUMNS =
  "id, code, title, description, category, pack, audience, collection, service_types, version, status, review_months, is_log, log_person_label, organisation_id, based_on_id, based_on_version";

/**
 * Whether this organisation may open a form: its own, or one of ours in a
 * pack its package includes.
 */
export function templateVisible(
  t: Pick<FormTemplateSummary, "organisation_id" | "pack" | "collection">,
  enabled: Record<string, boolean>,
  organisationId: string,
): boolean {
  if (t.organisation_id) return t.organisation_id === organisationId && !!enabled["forms.builder"];
  const { packs, collections } = visibleFormPacks(enabled);
  return packs.includes(t.pack) && (t.pack !== "addon" || collections.includes(t.collection ?? ""));
}

/** A company's own choices about one of our forms (Settings → Forms). */
export interface FormChoice {
  hidden: boolean;
  review_months: number | null;
}

export async function loadFormChoices(supabase: SupabaseClient, organisationId: string): Promise<Map<string, FormChoice>> {
  const { data } = await supabase
    .from("organisation_form_settings")
    .select("template_id, hidden, review_months")
    .eq("organisation_id", organisationId)
    .limit(1000);
  return new Map(
    (data ?? []).map((r) => [r.template_id as string, { hidden: r.hidden === true, review_months: (r.review_months as number | null) ?? null }]),
  );
}

/**
 * What a company's list shows (FORMS.md, "Editable"): its own published
 * forms, and ours — less any it has switched off, and less any it has
 * published its own copy of, which takes the original's place. A company's
 * own review period overrides ours. Pure.
 */
export function companyList(
  library: FormTemplateSummary[],
  own: FormTemplateSummary[],
  choices: Map<string, FormChoice>,
): FormTemplateSummary[] {
  const replaced = new Set(own.filter((t) => t.status === "published" && t.based_on_id).map((t) => t.based_on_id as string));
  const ours = library
    .filter((t) => !replaced.has(t.id) && !choices.get(t.id)?.hidden)
    .map((t) => ({ ...t, review_months: choices.get(t.id)?.review_months ?? t.review_months }));
  return [...ours, ...own.filter((t) => t.status === "published")];
}

/**
 * The forms this organisation uses, ours and its own. RLS already hides
 * drafts and other companies' forms. Without the fields: the list shows a
 * title and a description, and a template's questions are read when one is
 * opened (loadFormTemplate).
 */
export async function loadFormLibrary(
  supabase: SupabaseClient,
  { enabled, serviceType, organisationId }: { enabled: Record<string, boolean>; serviceType: string | null; organisationId: string },
): Promise<FormTemplateSummary[]> {
  const { packs, collections } = visibleFormPacks(enabled);
  if (packs.length === 0) return [];
  const [{ data }, choices] = await Promise.all([
    supabase
      .from("form_templates")
      .select(SUMMARY_COLUMNS)
      .eq("status", "published")
      .or(`organisation_id.is.null,organisation_id.eq.${organisationId}`)
      .order("category")
      .order("sort_order")
      .order("title")
      .limit(1000),
    loadFormChoices(supabase, organisationId),
  ]);
  const rows = (data ?? []).map(toSummary);
  const library = rows
    .filter((t) => !t.organisation_id && packs.includes(t.pack))
    .filter((t) => appliesTo(t.service_types, serviceType))
    .filter((t) => t.pack !== "addon" || collections.includes(t.collection ?? ""));
  const own = rows.filter((t) => t.organisation_id === organisationId);
  return companyList(library, own, choices);
}

/** The review period that applies to a form here: the company's own, or ours. */
export async function reviewMonthsFor(
  supabase: SupabaseClient,
  organisationId: string,
  template: Pick<FormTemplateSummary, "id" | "organisation_id" | "review_months">,
): Promise<number | null> {
  if (template.organisation_id) return template.review_months;
  const { data } = await supabase
    .from("organisation_form_settings")
    .select("review_months")
    .eq("organisation_id", organisationId)
    .eq("template_id", template.id)
    .maybeSingle();
  return (data?.review_months as number | null | undefined) ?? template.review_months;
}

export async function loadFormTemplate(
  supabase: SupabaseClient,
  code: string,
): Promise<FormTemplateRecord | null> {
  const { data } = await supabase
    .from("form_templates")
    .select(`${SUMMARY_COLUMNS}, fields`)
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  return { ...toSummary(data), fields: (data.fields as FormField[]) ?? [] };
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export interface Assignment {
  id: string;
  template_id: string;
  template_code: string;
  template_title: string;
  user_id: string;
  user_name: string;
  due_date: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
}

function toAssignment(r: Record<string, unknown>): Assignment {
  const t = unwrap(r.template) as { code?: string; title?: string } | undefined;
  const u = unwrap(r.person) as { full_name?: string | null; email?: string | null } | undefined;
  return {
    id: r.id as string,
    template_id: r.template_id as string,
    template_code: t?.code ?? "",
    template_title: t?.title ?? "Form",
    user_id: r.user_id as string,
    user_name: u?.full_name ?? u?.email ?? "Unnamed",
    due_date: (r.due_date as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

/** PostGREST embeds a to-one as an object, or an array when it cannot prove it. */
function unwrap(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

const ASSIGNMENT_SELECT =
  "id, template_id, user_id, due_date, note, completed_at, created_at, template:form_templates (code, title), person:users!form_assignments_user_id_fkey (full_name, email)";

/** Everything asked of one person, open first then newest. */
export async function loadAssignmentsForPerson(
  supabase: SupabaseClient,
  userId: string,
): Promise<Assignment[]> {
  const { data } = await supabase
    .from("form_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("user_id", userId)
    .order("completed_at", { nullsFirst: true })
    .order("due_date", { nullsFirst: false })
    .limit(200);
  return (data ?? []).map(toAssignment);
}

/** Everyone asked to complete one form, for the manager's view. */
export async function loadAssignmentsForTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<Assignment[]> {
  const { data } = await supabase
    .from("form_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("template_id", templateId)
    .order("completed_at", { nullsFirst: true })
    .order("due_date", { nullsFirst: false })
    .limit(500);
  return (data ?? []).map(toAssignment);
}

export async function loadAssignment(
  supabase: SupabaseClient,
  id: string,
): Promise<(Assignment & { template: FormTemplateRecord }) | null> {
  const { data } = await supabase
    .from("form_assignments")
    .select(
      "id, template_id, user_id, due_date, note, completed_at, created_at, template:form_templates (id, code, title, description, category, pack, audience, collection, service_types, version, status, review_months, is_log, log_person_label, organisation_id, based_on_id, based_on_version, fields), person:users!form_assignments_user_id_fkey (full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const t = unwrap(data.template) as Record<string, unknown> | undefined;
  if (!t) return null;
  return {
    ...toAssignment(data),
    template: { ...toSummary(t), fields: (t.fields as FormField[]) ?? [] },
  };
}

// ---------------------------------------------------------------------------
// Completed responses
// ---------------------------------------------------------------------------

export interface FormResponse {
  id: string;
  answers: Record<string, unknown>;
  signed_name: string | null;
  submitted_at: string;
  template_version: number;
}

/** What was handed in against one assignment, or null if nothing was. */
export async function loadResponse(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<FormResponse | null> {
  const { data } = await supabase
    .from("form_responses")
    .select("id, answers, signed_name, submitted_at, template_version")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    answers: (data.answers as Record<string, unknown> | null) ?? {},
    signed_name: (data.signed_name as string | null) ?? null,
    submitted_at: data.submitted_at as string,
    template_version: data.template_version as number,
  };
}

export interface ResponseRow {
  fieldId: string;
  label: string;
  /** The answer as it reads, or "" when the question was left blank. */
  value: string;
  /** Answered on an older version of the form; the question has since gone. */
  removed?: boolean;
  /** A file answer: where it is stored, for a "View file" link. */
  filePath?: string;
  /** A section heading rather than a question; only with { withHeadings }. */
  heading?: boolean;
}

/**
 * A response as question-and-answer rows, in the form's order (#54). The
 * template only keeps its current questions, so an answer whose question has
 * since been removed is still shown, at the end, rather than silently lost.
 */
export function responseRows(
  fields: FormField[],
  answers: Record<string, unknown>,
  { withHeadings = false }: { withHeadings?: boolean } = {},
): ResponseRow[] {
  const fileOf = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) && typeof (v as { file?: unknown }).file === "string"
      ? (v as { file: string; name?: string })
      : null;
  const text = (v: unknown): string => {
    const f = fileOf(v);
    if (f) return f.name ?? "File";
    return v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  };
  const known = new Set(fields.map((f) => f.id));
  // A conditional question that was never shown to them is not a blank answer.
  const rows: ResponseRow[] = [...fields]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((f) => isFieldVisible(f, answers) && (withHeadings || f.type !== "heading"))
    .map((f) => {
      if (f.type === "heading") return { fieldId: f.id, label: f.label, value: "", heading: true };
      const v = answers[f.id];
      // A date reads as a date; pinned to noon so no timezone can move it.
      const value =
        f.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? formatDate(`${v}T12:00:00Z`, { day: "numeric", month: "long", year: "numeric" })
          : text(v);
      return { fieldId: f.id, label: f.label, value, filePath: fileOf(v)?.file };
    });
  for (const [id, v] of Object.entries(answers)) {
    if (!known.has(id)) rows.push({ fieldId: id, label: "A question no longer on the form", value: text(v), removed: true });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface AnswerProblem {
  fieldId: string;
  label: string;
  problem: "required";
}

/**
 * What is wrong with a set of answers, before they are kept.
 *
 * Only visible fields can be required: a question hidden by a conditional
 * was never asked, and refusing the form over it would be a bug the carer
 * cannot fix. A signature counts as answered when a name has been typed
 * against it.
 */
export function validateAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): AnswerProblem[] {
  const problems: AnswerProblem[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    if (!isFieldVisible(f, answers)) continue;
    const v = answers[f.id];
    const empty =
      v == null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
    if (empty) problems.push({ fieldId: f.id, label: f.label, problem: "required" });
  }
  return problems;
}

/** Keep only answers to fields the form actually has, and only visible ones. */
export function pruneAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "heading" || !isFieldVisible(f, answers)) continue;
    if (answers[f.id] !== undefined) out[f.id] = answers[f.id];
  }
  return out;
}
