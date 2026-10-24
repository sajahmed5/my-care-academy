/**
 * Reading a complaint and its process. RLS does the scoping: everything here
 * goes through the request's client, so a page and the PDF route cannot see
 * different things.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplaintStage } from "./stages";
import { COMPLAINT_KINDS, kindOf } from "./stages";

export interface ComplaintPerson {
  user_id: string;
  name: string | null;
  involvement: string;
}

export interface StageEntry {
  stageId: string;
  status: string;
  notes: string | null;
  formAnswers: Record<string, unknown>;
  updatedAt: string;
}

export interface ComplaintDocument {
  id: string;
  stageId: string | null;
  filePath: string;
  fileName: string;
  fileSize: number | null;
  mime: string | null;
  uploadedAt: string;
}

/** An action agreed on the record, as record_actions holds it. */
export interface ComplaintAction {
  id: string;
  title: string;
  detail: string | null;
  ownerId: string;
  ownerName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  /** Which stage it was agreed at: "meeting:1", "meeting:2", "plan". Kept in detail. */
  stageTag: string | null;
}

export interface ComplaintSummary {
  id: string;
  reference: string;
  kind: string;
  status: string;
  raisedByName: string | null;
  aboutName: string | null;
  reportedOn: string;
  completeBy: string | null;
  closedOn: string | null;
  description: string;
}

export interface Complaint extends ComplaintSummary {
  raisedByRole: string | null;
  category: string | null;
  occurredOn: string | null;
  desiredOutcome: string | null;
  outcomeSummary: string | null;
  lessonsLearned: string | null;
  createdAt: string;
  people: ComplaintPerson[];
  stageEntries: StageEntry[];
  documents: ComplaintDocument[];
  actions: ComplaintAction[];
  /** Plans started from this record. */
  pips: { id: string; carerName: string; status: string; kind: string }[];
}

export interface StaffOption {
  value: string;
  label: string;
  role: string;
}

/** Every stage the organisation has configured, in order. */
export async function loadStages(supabase: SupabaseClient): Promise<ComplaintStage[]> {
  const { data } = await supabase
    .from("complaint_stages")
    .select("id, name, kind, applies_to, sort_order, enabled")
    .order("sort_order");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as string,
    appliesTo: (r.applies_to as string[] | null) ?? [],
    sortOrder: r.sort_order as number,
    enabled: r.enabled as boolean,
  }));
}

/** The organisation's people, for the "who took part" and "staff named" pickers. */
export async function loadStaffOptions(supabase: SupabaseClient): Promise<StaffOption[]> {
  const { data } = await supabase
    .from("users")
    .select("id, full_name, email, role")
    .in("role", ["org_admin", "learner"])
    .order("full_name")
    .limit(1000);
  return (data ?? []).map((u) => ({
    value: u.id as string,
    label: (u.full_name as string | null) || (u.email as string),
    role: u.role as string,
  }));
}

const summary = (r: Record<string, unknown>): ComplaintSummary => ({
  id: r.id as string,
  reference: r.reference as string,
  kind: r.kind as string,
  status: r.status as string,
  raisedByName: (r.raised_by_name as string | null) ?? null,
  aboutName: (r.about_name as string | null) ?? null,
  reportedOn: r.reported_on as string,
  completeBy: (r.complete_by as string | null) ?? null,
  closedOn: (r.closed_on as string | null) ?? null,
  description: r.description as string,
});

/** Every record in the organisation, newest first. */
export async function loadComplaints(supabase: SupabaseClient): Promise<ComplaintSummary[]> {
  const { data } = await supabase
    .from("complaints")
    .select("id, reference, kind, status, raised_by_name, about_name, reported_on, complete_by, closed_on, description")
    .order("reported_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((r) => summary(r as Record<string, unknown>));
}

/** Stage entries for a set of records: the list needs them to say where each is. */
export async function loadEntriesFor(
  supabase: SupabaseClient,
  complaintIds: string[],
): Promise<Map<string, StageEntry[]>> {
  const out = new Map<string, StageEntry[]>();
  if (complaintIds.length === 0) return out;
  const { data } = await supabase
    .from("complaint_stage_entries")
    .select("complaint_id, stage_id, status, notes, form_answers, updated_at")
    .in("complaint_id", complaintIds);
  for (const r of data ?? []) {
    const list = out.get(r.complaint_id as string) ?? [];
    list.push({
      stageId: r.stage_id as string,
      status: r.status as string,
      notes: (r.notes as string | null) ?? null,
      formAnswers: (r.form_answers as Record<string, unknown> | null) ?? {},
      updatedAt: r.updated_at as string,
    });
    out.set(r.complaint_id as string, list);
  }
  return out;
}

/** One record with everything hanging off it. Null when it is not theirs. */
export async function loadComplaint(supabase: SupabaseClient, id: string): Promise<Complaint | null> {
  const { data: row } = await supabase
    .from("complaints")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  const [entries, { data: people }, { data: docs }, { data: actions }, { data: pips }] = await Promise.all([
    loadEntriesFor(supabase, [id]),
    supabase
      .from("complaint_people")
      .select("user_id, involvement, person:users!complaint_people_user_id_fkey (full_name, email)")
      .eq("complaint_id", id),
    supabase
      .from("complaint_documents")
      .select("id, stage_id, file_path, file_name, file_size, mime, uploaded_at")
      .eq("complaint_id", id)
      .order("uploaded_at"),
    supabase
      .from("record_actions")
      .select("id, title, detail, due_date, completed_at, user_id, owner:users!record_actions_user_id_fkey (full_name, email)")
      .eq("source_type", "complaint")
      .eq("source_id", id)
      .order("created_at"),
    supabase
      .from("pips")
      .select("id, status, kind, carer:users!pips_user_id_fkey (full_name, email)")
      .eq("complaint_id", id),
  ]);

  const nameOf = (raw: unknown): string | null => {
    const p = (Array.isArray(raw) ? raw[0] : raw) as { full_name?: string | null; email?: string | null } | undefined;
    return p?.full_name ?? p?.email ?? null;
  };

  return {
    ...summary(row as Record<string, unknown>),
    raisedByRole: (row.raised_by_role as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    occurredOn: (row.occurred_on as string | null) ?? null,
    desiredOutcome: (row.desired_outcome as string | null) ?? null,
    outcomeSummary: (row.outcome_summary as string | null) ?? null,
    lessonsLearned: (row.lessons_learned as string | null) ?? null,
    createdAt: row.created_at as string,
    people: (people ?? []).map((p) => ({
      user_id: p.user_id as string,
      name: nameOf((p as { person?: unknown }).person),
      involvement: p.involvement as string,
    })),
    stageEntries: entries.get(id) ?? [],
    documents: (docs ?? []).map((d) => ({
      id: d.id as string,
      stageId: (d.stage_id as string | null) ?? null,
      filePath: d.file_path as string,
      fileName: d.file_name as string,
      fileSize: (d.file_size as number | null) ?? null,
      mime: (d.mime as string | null) ?? null,
      uploadedAt: d.uploaded_at as string,
    })),
    actions: (actions ?? []).map((a) => {
      const detail = (a.detail as string | null) ?? null;
      const tag = detail?.match(/^\[(meeting:\d|plan)\]\s*/);
      return {
        id: a.id as string,
        title: a.title as string,
        detail: tag ? detail!.slice(tag[0].length) || null : detail,
        ownerId: a.user_id as string,
        ownerName: nameOf((a as { owner?: unknown }).owner),
        dueDate: (a.due_date as string | null) ?? null,
        completedAt: (a.completed_at as string | null) ?? null,
        stageTag: tag ? tag[1] : null,
      };
    }),
    pips: (pips ?? []).map((p) => ({
      id: p.id as string,
      status: p.status as string,
      kind: p.kind as string,
      carerName: nameOf((p as { carer?: unknown }).carer) ?? "a carer",
    })),
  };
}

/**
 * The next reference for a record: COM-20261024-001, counted within the day
 * and the organisation. Read through the same client, so the count is of
 * what the organisation can see — which is all of its own.
 */
export async function nextReference(supabase: SupabaseClient, kind: string, today: string): Promise<string> {
  const prefix = COMPLAINT_KINDS.find((k) => k.value === kindOf(kind))!.prefix;
  const stem = `${prefix}-${today.replace(/-/g, "")}-`;
  const { data } = await supabase
    .from("complaints")
    .select("reference")
    .like("reference", `${stem}%`)
    .order("reference", { ascending: false })
    .limit(1);
  const last = data?.[0]?.reference as string | undefined;
  const n = last ? parseInt(last.slice(stem.length), 10) + 1 : 1;
  return `${stem}${String(n).padStart(3, "0")}`;
}
