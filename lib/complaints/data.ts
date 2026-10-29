/**
 * Reading a complaint and its process. RLS does the scoping: everything here
 * goes through the request's client, so a page and the PDF route cannot see
 * different things.
 *
 * Where a caller has the organisation to hand it passes it too. RLS still
 * decides what is visible; the explicit filter is what lets Postgres use the
 * organisation index rather than evaluating the policy row by row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplaintStage } from "./stages";
import { kindOf, prefixFor } from "./stages";

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

/**
 * A file on the record, as the page lists it. No storage path: the browser
 * opens a file through /org/complaints/<id>/documents/<docId>, which looks the
 * path up itself, so the bucket layout never needs to leave the server.
 */
export interface ComplaintDocument {
  id: string;
  stageId: string | null;
  fileName: string;
  fileSize: number | null;
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
  /** Which stage it was agreed at: "meeting:1", "meeting:2", "plan", "actions". Kept in detail. */
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
  category: string | null;
  /** The client it is about, from the client list, when one was chosen. */
  client: ComplaintClient | null;
}

export interface ComplaintClient {
  id: string;
  name: string;
  funderType: string;
  /** The council or other funder, as the client list has it. */
  funderName: string | null;
}

export interface Complaint extends ComplaintSummary {
  raisedByRole: string | null;
  /** How it reached us: the office, or the public raise-a-concern link. */
  raisedVia: string;
  /** How to reach whoever raised it online: they are not a user here. */
  raisedByContact: string | null;
  triagedAt: string | null;
  /** complaints.reminders: the legal reminders a manager has confirmed. */
  reminders: unknown;
  /** The interim update's "what we have found so far", in a person's words. */
  interimFindings: string | null;
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
  /** False once deactivated: still named on old records, never offered in a picker. */
  active: boolean;
}

/** Every stage the organisation has configured, in order. */
export async function loadStages(supabase: SupabaseClient, organisationId?: string | null): Promise<ComplaintStage[]> {
  let q = supabase.from("complaint_stages").select("id, name, kind, applies_to, sort_order, enabled");
  if (organisationId) q = q.eq("organisation_id", organisationId);
  const { data } = await q.order("sort_order");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as string,
    appliesTo: (r.applies_to as string[] | null) ?? [],
    sortOrder: r.sort_order as number,
    enabled: r.enabled as boolean,
  }));
}

/**
 * The organisation's people, for the "who took part" and "staff named"
 * pickers. Deactivated people are included so older records still show their
 * names (the PDF, saved answers); a picker offers only `pickable()` ones.
 */
export async function loadStaffOptions(supabase: SupabaseClient, organisationId?: string | null): Promise<StaffOption[]> {
  let q = supabase.from("users").select("id, full_name, email, role, status").in("role", ["org_admin", "org_office", "learner"]);
  if (organisationId) q = q.eq("organisation_id", organisationId);
  const { data } = await q.order("full_name").limit(1000);
  return (data ?? []).map((u) => ({
    value: u.id as string,
    label: (u.full_name as string | null) || (u.email as string),
    role: u.role as string,
    active: u.status === "active",
  }));
}

/**
 * Who a picker may offer: the active staff, plus anyone in `keep` — already
 * chosen on this record — so a saved choice is still shown, not dropped (#63).
 */
export function pickable(staff: StaffOption[], keep: Iterable<string | null | undefined> = []): StaffOption[] {
  const kept = new Set(keep);
  return staff.filter((s) => s.active || kept.has(s.value));
}

const CLIENT_EMBED = "client:clients (id, full_name, funder_type, funder_name)";

function clientOf(raw: unknown): ComplaintClient | null {
  const c = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  if (!c) return null;
  return {
    id: c.id as string,
    name: c.full_name as string,
    funderType: c.funder_type as string,
    funderName: (c.funder_name as string | null) ?? null,
  };
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
  category: (r.category as string | null) ?? null,
  client: clientOf(r.client),
});

/**
 * The answers the list's "what next" line reads, and nothing else. A stage's
 * form_answers holds the whole narrative of a meeting or a letter; the list
 * needs four keys out of it (lib/complaints/steps.ts nextStep: Triage's type,
 * date and attendees, and when the acknowledgement went), so it asks for
 * those by JSON path instead of shipping every record's answers to the server.
 */
const LIST_ENTRY_SELECT =
  "stage_id, status, updated_at, tri_type:form_answers->tri_type, mm1_date:form_answers->mm1_date, mm1_attendees:form_answers->mm1_attendees, sent_on:form_answers->sentOn";

/**
 * Every record in the organisation, newest first, with where each has got to.
 *
 * One request: the stage entries come embedded rather than as a second
 * `.in("complaint_id", …)` read, which at 500 records would have passed both
 * the URL limit and the 1,000-row cap — and a record whose entries were
 * silently dropped would show the wrong next step.
 */
export async function loadComplaintList(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<{ complaints: ComplaintSummary[]; entries: Map<string, StageEntry[]> }> {
  const { data } = await supabase
    .from("complaints")
    .select(
      `id, reference, kind, status, raised_by_name, about_name, reported_on, complete_by, closed_on, description, category, ${CLIENT_EMBED}, complaint_stage_entries (${LIST_ENTRY_SELECT})`,
    )
    .eq("organisation_id", organisationId)
    .order("reported_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const complaints: ComplaintSummary[] = [];
  const entries = new Map<string, StageEntry[]>();
  for (const r of data ?? []) {
    complaints.push(summary(r as Record<string, unknown>));
    const rows = ((r as { complaint_stage_entries?: Record<string, unknown>[] }).complaint_stage_entries ?? []);
    entries.set(
      r.id as string,
      rows.map((e) => {
        const formAnswers: Record<string, unknown> = {};
        if (e.tri_type != null) formAnswers.tri_type = e.tri_type;
        if (e.mm1_date != null) formAnswers.mm1_date = e.mm1_date;
        if (e.mm1_attendees != null) formAnswers.mm1_attendees = e.mm1_attendees;
        if (e.sent_on != null) formAnswers.sentOn = e.sent_on;
        return {
          stageId: e.stage_id as string,
          status: e.status as string,
          notes: null,
          formAnswers,
          updatedAt: e.updated_at as string,
        };
      }),
    );
  }
  return { complaints, entries };
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
    .select(
      `id, reference, kind, status, raised_by_name, raised_by_role, about_name, category, occurred_on, reported_on, complete_by, closed_on, description, desired_outcome, outcome_summary, lessons_learned, created_at, triaged_at, reminders, raised_via, raised_by_contact, interim_findings, ${CLIENT_EMBED}`,
    )
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
      .select("id, stage_id, file_name, file_size, uploaded_at")
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
    triagedAt: (row.triaged_at as string | null) ?? null,
    raisedVia: (row.raised_via as string | null) ?? "office",
    raisedByContact: (row.raised_by_contact as string | null) ?? null,
    reminders: row.reminders ?? {},
    interimFindings: (row.interim_findings as string | null) ?? null,
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
      fileName: d.file_name as string,
      fileSize: (d.file_size as number | null) ?? null,
      uploadedAt: d.uploaded_at as string,
    })),
    actions: (actions ?? []).map((a) => {
      const detail = (a.detail as string | null) ?? null;
      const tag = detail?.match(/^\[(meeting:\d|plan|actions|lessons)\]\s*/);
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
 * What closing a record checks, and only that: the record's kind, each
 * stage's status, the actions still open on it and the plans still running.
 * Closing used to read the whole record — every stage's answers, the files,
 * the people — to look at a handful of statuses.
 */
export async function loadCloseCheck(
  supabase: SupabaseClient,
  id: string,
): Promise<{
  kind: string;
  stageEntries: { stageId: string; status: string }[];
  openActions: string[];
  openPlans: string[];
} | null> {
  const [{ data: row }, { data: actions }, { data: pips }] = await Promise.all([
    supabase.from("complaints").select("kind, complaint_stage_entries (stage_id, status)").eq("id", id).maybeSingle(),
    supabase
      .from("record_actions")
      .select("title, owner:users!record_actions_user_id_fkey (full_name, email)")
      .eq("source_type", "complaint")
      .eq("source_id", id)
      .is("completed_at", null)
      .order("created_at"),
    supabase
      .from("pips")
      .select("kind, carer:users!pips_user_id_fkey (full_name, email)")
      .eq("complaint_id", id)
      .eq("status", "open"),
  ]);
  if (!row) return null;
  const nameOf = (raw: unknown): string | null => {
    const p = (Array.isArray(raw) ? raw[0] : raw) as { full_name?: string | null; email?: string | null } | undefined;
    return p?.full_name ?? p?.email ?? null;
  };
  const entries = ((row as { complaint_stage_entries?: Record<string, unknown>[] }).complaint_stage_entries ?? []);
  return {
    kind: row.kind as string,
    stageEntries: entries.map((e) => ({ stageId: e.stage_id as string, status: e.status as string })),
    openActions: (actions ?? []).map((a) => {
      const owner = nameOf((a as { owner?: unknown }).owner);
      return `${a.title as string}${owner ? ` — ${owner}` : ""}`;
    }),
    openPlans: (pips ?? []).map(
      (p) => `${p.kind === "disciplinary" ? "Disciplinary" : "Performance plan"} for ${nameOf((p as { carer?: unknown }).carer) ?? "a carer"}`,
    ),
  };
}

/**
 * The next reference for a record: COM-20261024-001, counted within the day
 * and the organisation. A concern not yet triaged is CON-, and keeps it. Read through the same client, so the count is of
 * what the organisation can see — which is all of its own.
 */
export async function nextReference(
  supabase: SupabaseClient,
  kind: string,
  today: string,
  /** Needed when the client is the service role, which sees every organisation. */
  organisationId?: string,
): Promise<string> {
  const prefix = prefixFor(kindOf(kind));
  const stem = `${prefix}-${today.replace(/-/g, "")}-`;
  let q = supabase.from("complaints").select("reference");
  if (organisationId) q = q.eq("organisation_id", organisationId);
  const { data } = await q
    .like("reference", `${stem}%`)
    .order("reference", { ascending: false })
    .limit(1);
  const last = data?.[0]?.reference as string | undefined;
  const n = last ? parseInt(last.slice(stem.length), 10) + 1 : 1;
  return `${stem}${String(n).padStart(3, "0")}`;
}
