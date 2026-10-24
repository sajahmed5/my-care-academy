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

export interface FormTemplateSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  pack: FormPack;
  collection: string | null;
  service_types: string[] | null;
  version: number;
  status: string;
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

function toSummary(r: Record<string, unknown>): FormTemplateSummary {
  return {
    id: r.id as string,
    code: r.code as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    category: r.category as string,
    pack: r.pack as FormPack,
    collection: (r.collection as string | null) ?? null,
    service_types: (r.service_types as string[] | null) ?? null,
    version: (r.version as number) ?? 1,
    status: (r.status as string) ?? "draft",
    fieldCount: Array.isArray(r.fields) ? (r.fields as unknown[]).length : null,
  };
}

/**
 * The published forms this organisation can assign. RLS already hides drafts.
 * Without the fields: the list shows a title and a description, and a
 * template's questions are read when one is opened (loadFormTemplate).
 */
export async function loadFormLibrary(
  supabase: SupabaseClient,
  { enabled, serviceType }: { enabled: Record<string, boolean>; serviceType: string | null },
): Promise<FormTemplateSummary[]> {
  const { packs, collections } = visibleFormPacks(enabled);
  if (packs.length === 0) return [];
  const { data } = await supabase
    .from("form_templates")
    .select("id, code, title, description, category, pack, collection, service_types, version, status")
    .in("pack", packs)
    .order("category")
    .order("sort_order")
    .limit(500);
  return (data ?? [])
    .map(toSummary)
    .filter((t) => appliesTo(t.service_types, serviceType))
    .filter((t) => t.pack !== "addon" || collections.includes(t.collection ?? ""));
}

export async function loadFormTemplate(
  supabase: SupabaseClient,
  code: string,
): Promise<FormTemplateRecord | null> {
  const { data } = await supabase
    .from("form_templates")
    .select("id, code, title, description, category, pack, collection, service_types, version, status, fields")
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
      "id, template_id, user_id, due_date, note, completed_at, created_at, template:form_templates (id, code, title, description, category, pack, collection, service_types, version, status, fields), person:users!form_assignments_user_id_fkey (full_name, email)",
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
    if (!isFieldVisible(f, answers)) continue;
    if (answers[f.id] !== undefined) out[f.id] = answers[f.id];
  }
  return out;
}
