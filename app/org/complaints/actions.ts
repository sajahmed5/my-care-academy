"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireConsole, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import type { SaveState } from "@/app/platform/actions";
import {
  COMPLAINT_KINDS,
  DEFAULT_STAGES,
  RAISED_BY_ROLES,
  STAGE_KINDS,
  UNTRIAGED,
  completeByFor,
  isComplaintKind,
  isUntriaged,
  kindOf,
  stagesFor,
  type ComplaintKind,
} from "@/lib/complaints/stages";
import { CONCERN_CATEGORIES } from "@/lib/complaints/categories";
import { REMINDER_KEYS } from "@/lib/complaints/reminders";
import { loadCloseCheck, loadStages, nextReference } from "@/lib/complaints/data";
import { actionTagFor, computeStageStatus, isTriageStage, holdsFindings } from "@/lib/complaints/compute";
import { cleanConcernFindings, CONCERN_FINDINGS_KEY, type ConcernFinding } from "@/lib/complaints/findings";
import {
  FINDINGS_NA_KEY,
  TRIAGE_NA_KEY,
  findingsActionNamed,
  triageCheckNamed,
} from "@/lib/complaints/stage-status";
import { closeGaps, closeGapsMessage } from "@/lib/complaints/close";
import { emailAssignees } from "@/lib/assignment-email";
import { COMPLAINT_NATURES } from "@/lib/complaints/forms";
import { siteOrigin } from "@/lib/site-url";
import { STAFF_ROLES } from "@/lib/roles";

/**
 * The complaint process. Written through the RLS-scoped client, so the
 * policies — org admin, own organisation, complaints.register — are the gate.
 * The feature is also checked here so a manager sees "not in your plan"
 * rather than a row-level security error.
 */

const NOT_IN_PLAN = "Complaints are not included in your plan.";
const BUCKET = "complaint-documents";
const today = () => new Date().toISOString().slice(0, 10);

async function requireComplaints() {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return null;
  return context;
}

/** Changing the process is a setting: managers only (Settings, 30 Oct 2026). */
async function requireComplaintsManager() {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "complaints.register"))) return null;
  return context;
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * The titles of the live actions agreed at Triage on one record. Triage is not
 * done until every standing check has one.
 */
async function triageActionTitles(supabase: Awaited<ReturnType<typeof createClient>>, complaintId: string) {
  const { data } = await supabase
    .from("record_actions")
    .select("title, detail")
    .eq("source_type", "complaint")
    .eq("source_id", complaintId);
  return (data ?? [])
    .filter((a) => String(a.detail ?? "").startsWith("[meeting:1]"))
    .map((a) => a.title as string);
}

/** Write a stage's status from what is on it, after a save. */
async function recompute(
  supabase: Awaited<ReturnType<typeof createClient>>,
  complaintId: string,
  stage: { id: string; name: string; kind: string },
  answers: Record<string, unknown>,
  userId: string,
) {
  const titles = isTriageStage(stage) ? await triageActionTitles(supabase, complaintId) : [];
  const status = computeStageStatus(stage, answers, titles);
  const { error } = await supabase.from("complaint_stage_entries").upsert(
    {
      complaint_id: complaintId,
      stage_id: stage.id,
      form_answers: answers,
      ...(status ? { status } : {}),
      updated_by: userId,
    },
    { onConflict: "complaint_id,stage_id" },
  );
  return error?.message ?? null;
}

async function stageById(supabase: Awaited<ReturnType<typeof createClient>>, stageId: string) {
  const { data } = await supabase
    .from("complaint_stages")
    .select("id, name, kind")
    .eq("id", stageId)
    .maybeSingle();
  return data as { id: string; name: string; kind: string } | null;
}

async function entryAnswers(supabase: Awaited<ReturnType<typeof createClient>>, complaintId: string, stageId: string) {
  const { data } = await supabase
    .from("complaint_stage_entries")
    .select("form_answers")
    .eq("complaint_id", complaintId)
    .eq("stage_id", stageId)
    .maybeSingle();
  return ((data?.form_answers as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The process itself
// ---------------------------------------------------------------------------

/** Give an organisation the default stages. Only when it has none. */
export async function seedStagesAction(): Promise<SaveState> {
  const context = await requireComplaintsManager();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const supabase = await createClient();
  const { count: existing } = await supabase
    .from("complaint_stages")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", context.organisationId!);
  if ((existing ?? 0) > 0) return { ok: true };
  const { error } = await supabase.from("complaint_stages").insert(
    DEFAULT_STAGES.map((s, i) => ({
      organisation_id: context.organisationId,
      name: s.name,
      kind: s.kind,
      applies_to: s.appliesTo,
      sort_order: (i + 1) * 10,
      enabled: true,
    })),
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "complaint.stages_seeded", entity: "complaint_stages" });
  revalidatePath("/org/complaints");
  revalidatePath("/org/settings/complaints/process");
  return { ok: true };
}

export async function saveStageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaintsManager();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "stageId");
  const name = str(formData, "name");
  const kind = str(formData, "kind");
  const appliesTo = formData.getAll("appliesTo").map(String).filter((k) => COMPLAINT_KINDS.some((c) => c.value === k));
  const enabled = formData.get("enabled") === "on";
  const sortOrder = parseInt(str(formData, "sortOrder") || "0", 10) || 0;
  if (!name) return { ok: false, error: "Give the stage a name." };
  if (!STAGE_KINDS.some((k) => k.value === kind)) return { ok: false, error: "Pick what the stage opens." };
  if (appliesTo.length === 0) return { ok: false, error: "Pick at least one kind of record it applies to." };

  const supabase = await createClient();
  const row = { name, kind, applies_to: appliesTo, enabled, sort_order: sortOrder };
  const { error } = id
    ? await supabase.from("complaint_stages").update(row).eq("id", id)
    : await supabase.from("complaint_stages").insert({ ...row, organisation_id: context.organisationId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/settings/complaints/process");
  revalidatePath("/org/complaints");
  return { ok: true };
}

export async function deleteStageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaintsManager();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "stageId");
  const supabase = await createClient();
  // A stage with answers on it is history, not configuration: disable it instead.
  const { count } = await supabase
    .from("complaint_stage_entries")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  if (count && count > 0) {
    const { error } = await supabase.from("complaint_stages").update({ enabled: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/org/settings/complaints/process");
    return { ok: true, error: undefined };
  }
  const { error } = await supabase.from("complaint_stages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/settings/complaints/process");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * What a new record already knows, written into the first stages of its
 * type's process so nobody types it twice: the Triage meeting starts with the
 * type and the concern, and an accident or near miss report with what was
 * said to have happened. Only stages with nothing on them yet are touched.
 */
async function prefillStages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  complaintId: string,
  kind: string,
  record: { reportedOn: string; occurredOn: string | null; description: string; council?: string | null },
  userId: string,
) {
  const [allStages, { data: existing }] = await Promise.all([
    loadStages(supabase),
    supabase.from("complaint_stage_entries").select("stage_id").eq("complaint_id", complaintId),
  ]);
  const have = new Set((existing ?? []).map((e) => e.stage_id as string));
  const happened = record.occurredOn || record.reportedOn;
  for (const stage of stagesFor(allStages, kind)) {
    if (have.has(stage.id)) continue;
    let answers: Record<string, unknown> | null = null;
    if (isTriageStage(stage)) {
      answers = {
        ...(["complaint", "safeguarding", "issue"].includes(kind) ? { tri_type: kind } : {}),
        mm1_issue: record.description,
        mm1_when_received: record.reportedOn,
      };
    } else if (stage.kind === "accident_report") {
      answers = { ar_date: happened, ar_what: record.description };
    } else if (stage.kind === "near_miss_report") {
      answers = { nm_date: happened, nm_what: record.description };
    } else if (stage.kind === "sg_immediate") {
      answers = { sgi_date: record.reportedOn };
    } else if (stage.kind === "sg_referral" && record.council) {
      // The council that funds the client is usually the one to refer to.
      answers = { sgr_council: record.council };
    }
    if (answers) await recompute(supabase, complaintId, stage, answers, userId);
  }
}

/**
 * A concern, raised through the front door. It may be triaged on the spot —
 * the office often knows an accident is an accident — or left as a concern
 * for someone to triage.
 */
export async function createComplaintAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const kind = kindOf(str(formData, "kind") || UNTRIAGED);
  const raisedByName = str(formData, "raisedByName");
  const raisedByRole = str(formData, "raisedByRole");
  let aboutName = str(formData, "aboutName");
  const clientId = str(formData, "clientId");
  const category = str(formData, "category");
  const personId = str(formData, "personId");
  const reportedOn = str(formData, "reportedOn") || today();
  const occurredOn = str(formData, "occurredOn");
  const description = str(formData, "description");
  const desiredOutcome = str(formData, "desiredOutcome");
  const nature = str(formData, "nature");

  if (!COMPLAINT_NATURES.some((n) => n.value === nature)) return { ok: false, error: "Say who or what it is about." };
  if (category && !CONCERN_CATEGORIES.some((c) => c.value === category)) return { ok: false, error: "Pick what it was about." };
  if (!description) return { ok: false, error: "Say what was raised." };
  if (description.length > 10000) return { ok: false, error: "Keep it under 10,000 characters." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportedOn)) return { ok: false, error: "Say when it reached you." };
  if (raisedByRole && !RAISED_BY_ROLES.some((r) => r.value === raisedByRole)) {
    return { ok: false, error: "Pick who raised it." };
  }

  const supabase = await createClient();
  const [allStages, reference, client] = await Promise.all([
    loadStages(supabase, context.organisationId),
    nextReference(supabase, kind, reportedOn),
    clientId
      ? supabase.from("clients").select("id, full_name, funder_type, funder_name").eq("id", clientId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  if (allStages.length === 0) return { ok: false, error: "Set up the process first: the organisation has no stages yet." };
  if (clientId && !client) return { ok: false, error: "That client is not on your client list." };
  if (client && !aboutName) aboutName = client.full_name as string;
  const triaged = !isUntriaged(kind);

  const { data: row, error } = await supabase
    .from("complaints")
    .insert({
      organisation_id: context.organisationId,
      reference,
      kind,
      raised_by_name: raisedByName || null,
      raised_by_role: raisedByRole || null,
      about_name: aboutName || null,
      client_id: client ? clientId : null,
      category: category || null,
      reported_on: reportedOn,
      occurred_on: occurredOn || null,
      // Only a complaint carries the 28-day clock. An issue or a safeguarding
      // concern has no statutory response date, and a fabricated one would
      // show up red for no reason. A concern gets it when triaged as one.
      complete_by: kind === "complaint" ? completeByFor(reportedOn) : null,
      description,
      desired_outcome: desiredOutcome || null,
      triaged_at: triaged ? new Date().toISOString() : null,
      triaged_by: triaged ? context.userId : null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const complaintId = row.id as string;

  // Raised from an answer to a named feedback survey: the answer remembers it,
  // so the same low score is never raised twice.
  const feedbackResponseId = str(formData, "feedbackResponseId");
  if (feedbackResponseId) {
    await supabase.from("feedback_responses").update({ complaint_id: complaintId }).eq("id", feedbackResponseId);
  }

  // Raised from a member of staff's file: they are named on it from the start.
  if (personId) {
    await supabase.from("complaint_people").insert({ complaint_id: complaintId, user_id: personId, involvement: "involved" });
  }

  // What was typed here IS the complaint form, so the first stage starts
  // filled in rather than asking for the same facts a second time. Written
  // for a concern not yet triaged too: it is what was raised, whatever it
  // turns out to be. An accident or near miss has its own report instead.
  const form = allStages.find((s) => s.kind === "complaint_form" && s.enabled);
  if (form && !["accident", "near_miss"].includes(kind)) {
    const answers: Record<string, unknown> = {
      // "Date raised" on the stage is when it reached us, as on Record one.
      cf_date: reportedOn,
      cf_complainant: raisedByName,
      cf_relationship: raisedByRole || undefined,
      cf_about: aboutName || undefined,
      cf_nature: nature,
      cf_details: description,
      cf_desired: desiredOutcome || undefined,
      cf_recorded_by: context.email ?? undefined,
    };
    await recompute(supabase, complaintId, form, answers, context.userId);
  }
  if (triaged) {
    const council = client?.funder_type === "council" ? ((client.funder_name as string | null) ?? null) : null;
    await prefillStages(supabase, complaintId, kind, { reportedOn, occurredOn: occurredOn || null, description, council }, context.userId);
  }

  await logAudit({
    context,
    action: "complaint.recorded",
    entity: "complaint",
    entityId: complaintId,
    detail: { kind, reference },
  });

  revalidatePath("/org/complaints");
  if (personId) revalidatePath(`/org/staff/${personId}`);
  redirect(`/org/complaints/${complaintId}`);
}

/**
 * Set what a record is, and the clock that goes with it: a complaint is due a
 * response 28 days from when it reached us; nothing else has that clock.
 */
async function setKind(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  kind: ComplaintKind,
  userId: string,
): Promise<{
  error?: string;
  record?: { reportedOn: string; occurredOn: string | null; description: string; council: string | null; was: string };
}> {
  const { data: row } = await supabase
    .from("complaints")
    .select("kind, reported_on, occurred_on, description, complete_by, triaged_at, client:clients (funder_type, funder_name)")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "That record is no longer there." };
  const reportedOn = row.reported_on as string;
  const { error } = await supabase
    .from("complaints")
    .update({
      kind,
      complete_by: kind === "complaint" ? ((row.complete_by as string | null) ?? completeByFor(reportedOn)) : null,
      triaged_at: (row.triaged_at as string | null) ?? new Date().toISOString(),
      triaged_by: userId,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  const client = (Array.isArray(row.client) ? row.client[0] : row.client) as { funder_type?: string; funder_name?: string | null } | null;
  return {
    record: {
      council: client?.funder_type === "council" ? (client.funder_name ?? null) : null,
      reportedOn,
      occurredOn: (row.occurred_on as string | null) ?? null,
      description: row.description as string,
      was: row.kind as string,
    },
  };
}

/**
 * Triage: decide which of the five types a concern is, which decides the
 * process it follows. Also how an open record is moved to another type when
 * the facts say it was triaged wrongly — what is already on it is kept.
 */
export async function triageConcernAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const kind = str(formData, "kind");
  if (!isComplaintKind(kind)) return { ok: false, error: "Pick what this is." };

  const supabase = await createClient();
  const result = await setKind(supabase, id, kind, context.userId);
  if (result.error || !result.record) return { ok: false, error: result.error };
  await prefillStages(supabase, id, kind, result.record, context.userId);

  await logAudit({
    context,
    action: "complaint.triaged",
    entity: "complaint",
    entityId: id,
    detail: { from: result.record.was, to: kind },
  });
  revalidatePath(`/org/complaints/${id}`);
  revalidatePath("/org/complaints");
  return { ok: true };
}

/** Which client a concern is about, from the client list. */
export async function setClientAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const clientId = str(formData, "clientId");
  const supabase = await createClient();
  let name: string | null = null;
  if (clientId) {
    const { data: client } = await supabase.from("clients").select("full_name").eq("id", clientId).maybeSingle();
    if (!client) return { ok: false, error: "That client is not on your client list." };
    name = client.full_name as string;
  }
  const { error } = await supabase
    .from("complaints")
    .update({ client_id: clientId || null, ...(name ? { about_name: name } : {}) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/complaints/${id}`);
  if (clientId) revalidatePath(`/org/clients/${clientId}`);
  return { ok: true };
}

/** What a concern is about, which drives the training it suggests and the trends. */
export async function setCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const category = str(formData, "category");
  if (category && !CONCERN_CATEGORIES.some((c) => c.value === category)) return { ok: false, error: "Pick what it was about." };
  const supabase = await createClient();
  const { error } = await supabase.from("complaints").update({ category: category || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/complaints/${id}`);
  return { ok: true };
}

/** Open, withdrawn or cancelled. Closing is its own action, with its own rules. */
export async function setComplaintStatusAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const status = str(formData, "status");
  if (!["open", "withdrawn", "cancelled"].includes(status)) return { ok: false, error: "Pick a status." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("complaints")
    .update({ status, closed_on: status === "open" ? null : today() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "complaint.status", entity: "complaint", entityId: id, detail: { status } });
  revalidatePath(`/org/complaints/${id}`);
  revalidatePath("/org/complaints");
  return { ok: true };
}

/**
 * Close the record. Refused while any counted stage is open, any action
 * agreed on it is not done, or a plan started from it is still running — the
 * same rules the screen shows, from the same function.
 */
export async function closeComplaintAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const outcomeSummary = str(formData, "outcomeSummary");
  const lessons = str(formData, "lessonsLearned");
  if (!outcomeSummary) return { ok: false, error: "Say what came of it before closing." };

  const supabase = await createClient();
  const [complaint, allStages] = await Promise.all([
    loadCloseCheck(supabase, id),
    loadStages(supabase, context.organisationId),
  ]);
  if (!complaint) return { ok: false, error: "That record is no longer there." };
  const stages = stagesFor(allStages, complaint.kind);

  const gaps = closeGaps(stages, complaint.stageEntries);
  const triage = stages.find(isTriageStage);
  const triaged =
    !isUntriaged(complaint.kind) &&
    (!triage || complaint.stageEntries.some((e) => e.stageId === triage.id && e.status !== "pending"));
  const message = closeGapsMessage(gaps, !triaged, {
    openActions: complaint.openActions,
    openPlans: complaint.openPlans,
  });
  if (message) return { ok: false, error: message };

  const { error } = await supabase
    .from("complaints")
    .update({
      status: "closed",
      closed_on: today(),
      outcome_summary: outcomeSummary,
      lessons_learned: lessons || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "complaint.closed", entity: "complaint", entityId: id });
  revalidatePath(`/org/complaints/${id}`);
  revalidatePath("/org/complaints");
  return { ok: true };
}

export async function setPeopleAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const userId = str(formData, "userId");
  const involvement = str(formData, "involvement") || "involved";
  const remove = formData.get("remove") === "1";
  if (!id || !userId) return { ok: false, error: "Pick a person." };
  const supabase = await createClient();
  const { error } = remove
    ? await supabase.from("complaint_people").delete().eq("complaint_id", id).eq("user_id", userId)
    : await supabase
        .from("complaint_people")
        .upsert({ complaint_id: id, user_id: userId, involvement }, { onConflict: "complaint_id,user_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/complaints/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stages on a record
// ---------------------------------------------------------------------------

/** Mark a stage done, not needed or pending by hand. Document stages, and "not needed" on anything. */
export async function setStageStatusAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const stageId = str(formData, "stageId");
  const status = str(formData, "status");
  const notes = str(formData, "notes");
  if (!["pending", "done", "na"].includes(status)) return { ok: false, error: "Pick a status." };
  if (status === "na" && !notes) return { ok: false, error: "Say why this stage is not needed." };

  const supabase = await createClient();
  const stage = await stageById(supabase, stageId);
  if (!stage) return { ok: false, error: "That stage is no longer there." };
  // A form or letter stage is done when its contents say so, never by a tick.
  if (status === "done" && stage.kind !== "document") {
    return { ok: false, error: "This stage is done when its form is complete, not by marking it." };
  }
  const { error } = await supabase.from("complaint_stage_entries").upsert(
    { complaint_id: complaintId, stage_id: stageId, status, notes: notes || null, updated_by: context.userId },
    { onConflict: "complaint_id,stage_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/complaints/${complaintId}`);
  revalidatePath("/org/complaints");
  return { ok: true };
}

/**
 * Save a stage's form. Answers come as one JSON field, written by the client
 * component from the schema; the status is then derived, not sent.
 */
export async function saveStageFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const stageId = str(formData, "stageId");
  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(str(formData, "answers") || "{}") as Record<string, unknown>;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error();
  } catch {
    return { ok: false, error: "The answers could not be read." };
  }

  const supabase = await createClient();
  const [stage, existing] = await Promise.all([
    stageById(supabase, stageId),
    entryAnswers(supabase, complaintId, stageId),
  ]);
  if (!stage) return { ok: false, error: "That stage is no longer there." };
  // The findings on each concern come with the answers, on the stages that
  // hold them: one Save for the whole panel, at the bottom of it (#67).
  const findingsRaw = formData.get("findings");
  if (findingsRaw !== null && holdsFindings(stage)) {
    const list = parseFindings(String(findingsRaw));
    if (!list) return { ok: false, error: "The findings could not be read." };
    answers[CONCERN_FINDINGS_KEY] = list;
  }
  // Keep what the form does not own: the findings list, the not-needed marks.
  const kept: Record<string, unknown> = {};
  for (const k of [CONCERN_FINDINGS_KEY, TRIAGE_NA_KEY, FINDINGS_NA_KEY, "sentOn", "subject", "body", "sentTo"]) {
    if (k in existing && !(k in answers)) kept[k] = existing[k];
  }
  const err = await recompute(supabase, complaintId, stage, { ...kept, ...answers }, context.userId);
  if (err) return { ok: false, error: err };
  // The Triage meeting's "Type" is the record's type: changing it there
  // moves the record, as Change type does, rather than leaving the two to
  // disagree.
  const triType = answers.tri_type;
  if (isTriageStage(stage) && typeof triType === "string" && isComplaintKind(triType)) {
    const { data: cur } = await supabase.from("complaints").select("kind").eq("id", complaintId).maybeSingle();
    if (cur && cur.kind !== triType) {
      const moved = await setKind(supabase, complaintId, triType, context.userId);
      if (moved.error) return { ok: false, error: moved.error };
      await logAudit({ context, action: "complaint.triaged", entity: "complaint", entityId: complaintId, detail: { from: cur.kind, to: triType } });
    }
  }
  revalidatePath(`/org/complaints/${complaintId}`);
  revalidatePath("/org/complaints");
  return { ok: true };
}

/** The acknowledgement, outcome or duty of candour letter: its text and when it went. */
export async function saveLetterAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const stageId = str(formData, "stageId");
  const subject = str(formData, "subject");
  const body = str(formData, "body");
  const sentOn = str(formData, "sentOn");
  const sentTo = str(formData, "sentTo");
  if (sentOn && !body) return { ok: false, error: "A letter cannot be marked sent with nothing in it." };
  if (sentOn && !/^\d{4}-\d{2}-\d{2}$/.test(sentOn)) return { ok: false, error: "Say when it was sent." };

  const supabase = await createClient();
  const [stage, existing] = await Promise.all([
    stageById(supabase, stageId),
    entryAnswers(supabase, complaintId, stageId),
  ]);
  if (!stage) return { ok: false, error: "That stage is no longer there." };
  const err = await recompute(
    supabase,
    complaintId,
    stage,
    { ...existing, subject, body, sentOn: sentOn || undefined, sentTo: sentTo || undefined },
    context.userId,
  );
  if (err) return { ok: false, error: err };
  await logAudit({
    context,
    action: sentOn ? "complaint.letter_sent" : "complaint.letter_saved",
    entity: "complaint",
    entityId: complaintId,
    detail: { stage: stage.name, sentOn: sentOn || null },
  });
  revalidatePath(`/org/complaints/${complaintId}`);
  revalidatePath("/org/complaints");
  return { ok: true };
}

/**
 * The finding on each concern, as the Findings editor sends it, cleaned; null
 * when it cannot be read. It is saved with the rest of the stage, by the one
 * Save at the bottom of the panel (#67).
 */
function parseFindings(raw: string): ConcernFinding[] | null {
  try {
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return null;
    return cleanConcernFindings(
      list.map((r: Record<string, unknown>, i: number) => ({
        id: typeof r.id === "string" && r.id ? r.id : `c${i + 1}`,
        concern: String(r.concern ?? ""),
        finding: ["upheld", "partly_upheld", "not_upheld", "undetermined"].includes(String(r.finding))
          ? (r.finding as ConcernFinding["finding"])
          : undefined,
        why: String(r.why ?? ""),
      })),
    );
  } catch {
    return null;
  }
}

/**
 * An action agreed at a stage: a record_actions row for the owner, tagged in
 * its detail with where it was agreed so the record can list it under the
 * right meeting. Adding one re-derives Triage, which may now be done.
 */
export async function addActionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const stageId = str(formData, "stageId");
  const title = str(formData, "title");
  const ownerId = str(formData, "ownerId");
  const dueDate = str(formData, "dueDate");
  const detail = str(formData, "detail");
  if (!title) return { ok: false, error: "Say what is to be done." };
  if (!ownerId) return { ok: false, error: "Give it an owner." };
  // An owner with no date has nothing to work to, and nothing can show it as
  // overdue (#65). Asked for here, not in the table, which other records share.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: "Give it a date it is to be done by." };

  const supabase = await createClient();
  const stage = await stageById(supabase, stageId);
  if (!stage) return { ok: false, error: "That stage is no longer there." };
  const tag = actionTagFor(stage);

  const { error } = await supabase.from("record_actions").insert({
    organisation_id: context.organisationId,
    user_id: ownerId,
    title,
    detail: `[${tag}]${detail ? ` ${detail}` : ""}`,
    due_date: dueDate,
    source_type: "complaint",
    source_id: complaintId,
    created_by: context.userId,
  });
  if (error) return { ok: false, error: error.message };

  // Tell the owner (#66). A console user can open the record; a carer sees
  // the action itself, on My actions.
  const origin = await siteOrigin();
  const organisationId = context.organisationId!;
  after(async () => {
    const admin = createAdminClient();
    const { data: owner } = await admin.from("users").select("role").eq("id", ownerId).maybeSingle();
    const inConsole = owner?.role === "org_admin" || owner?.role === "org_office";
    await emailAssignees(
      admin,
      "action_assigned",
      [{ userId: ownerId, title, dueDate, href: inConsole ? `/org/complaints/${complaintId}` : "/learn/actions", note: detail || null }],
      { organisationId, assignedBy: context.userId, origin },
    );
  });

  if (isTriageStage(stage)) {
    const existing = await entryAnswers(supabase, complaintId, stageId);
    await recompute(supabase, complaintId, stage, existing, context.userId);
  }
  revalidatePath(`/org/complaints/${complaintId}`);
  revalidatePath(`/org/staff/${ownerId}`);
  return { ok: true };
}

export async function setActionDoneAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const actionId = str(formData, "actionId");
  const done = formData.get("done") === "1";
  const supabase = await createClient();
  const { error } = await supabase
    .from("record_actions")
    .update({ completed_at: done ? new Date().toISOString() : null, completed_by: done ? context.userId : null })
    .eq("id", actionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/complaints/${complaintId}`);
  return { ok: true };
}

export async function deleteActionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const actionId = str(formData, "actionId");
  const stageId = str(formData, "stageId");
  const supabase = await createClient();
  const { error } = await supabase.from("record_actions").delete().eq("id", actionId);
  if (error) return { ok: false, error: error.message };
  const stage = stageId ? await stageById(supabase, stageId) : null;
  if (stage && isTriageStage(stage)) {
    await recompute(supabase, complaintId, stage, await entryAnswers(supabase, complaintId, stageId), context.userId);
  }
  revalidatePath(`/org/complaints/${complaintId}`);
  return { ok: true };
}

/** A standing check or Findings action this record does not need, with why. */
export async function markNotNeededAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const stageId = str(formData, "stageId");
  const name = str(formData, "name");
  const why = str(formData, "why");
  const clear = formData.get("clear") === "1";
  // A standing action that was given an owner and then turns out not to be
  // needed: its action goes, and the reason is kept in its place. Before,
  // the only way out was deleting it, which left no reason behind.
  const actionId = str(formData, "actionId");
  if (!clear && !why) return { ok: false, error: "Say why it is not needed." };

  const supabase = await createClient();
  const [stage, existing] = await Promise.all([
    stageById(supabase, stageId),
    entryAnswers(supabase, complaintId, stageId),
  ]);
  if (!stage) return { ok: false, error: "That stage is no longer there." };
  const triage = isTriageStage(stage);
  const check = triage ? triageCheckNamed(name) : findingsActionNamed(name);
  if (!check) return { ok: false, error: "That is not one of the standing checks." };
  const key = triage ? TRIAGE_NA_KEY : FINDINGS_NA_KEY;

  if (actionId && !clear) {
    const { error: delError } = await supabase
      .from("record_actions")
      .delete()
      .eq("id", actionId)
      .eq("source_type", "complaint")
      .eq("source_id", complaintId)
      .is("completed_at", null);
    if (delError) return { ok: false, error: delError.message };
  }

  const na = { ...((existing[key] as Record<string, string> | undefined) ?? {}) };
  if (clear) delete na[check];
  else na[check] = why;
  const err = await recompute(supabase, complaintId, stage, { ...existing, [key]: na }, context.userId);
  if (err) return { ok: false, error: err };
  revalidatePath(`/org/complaints/${complaintId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocumentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const stageId = str(formData, "stageId");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "Files must be under 20 MB." };

  const supabase = await createClient();
  // The record must be theirs before anything lands in the bucket.
  const { data: owned } = await supabase.from("complaints").select("id").eq("id", complaintId).maybeSingle();
  if (!owned) return { ok: false, error: "That record is no longer there." };

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${context.organisationId}/${complaintId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { error } = await supabase.from("complaint_documents").insert({
    complaint_id: complaintId,
    stage_id: stageId || null,
    file_path: path,
    file_name: file.name.slice(0, 200),
    file_size: file.size,
    mime: file.type || null,
    uploaded_by: context.userId,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }
  revalidatePath(`/org/complaints/${complaintId}`);
  return { ok: true };
}

export async function deleteDocumentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const complaintId = str(formData, "complaintId");
  const documentId = str(formData, "documentId");
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("complaint_documents")
    .select("file_path")
    .eq("id", documentId)
    .eq("complaint_id", complaintId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "That file is no longer there." };
  const { error } = await supabase.from("complaint_documents").delete().eq("id", documentId);
  if (error) return { ok: false, error: error.message };
  await createAdminClient().storage.from(BUCKET).remove([doc.file_path as string]);
  revalidatePath(`/org/complaints/${complaintId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suggested training
// ---------------------------------------------------------------------------

/**
 * Assign a suggested course, because a manager decided to.
 *
 * This is the whole reason suggestions are suggestions. The enrolment is
 * created the same way the bulk assign creates one, and complaint_training
 * records who decided and why — so the record reads "the manager reviewed it
 * and assigned refresher training on the 3rd", not "the system assigned
 * training on receipt of a complaint".
 */
export async function assignConcernTrainingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const complaintId = str(formData, "complaintId");
  const userId = str(formData, "userId");
  const courseId = str(formData, "courseId");
  const reason = str(formData, "reason");
  const dueDate = str(formData, "dueDate");
  if (!complaintId || !userId || !courseId) return { ok: false, error: "Missing the record, the person or the course." };
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: "Give the date as a date." };

  const supabase = await createClient();
  // One of theirs, and active: the same guard the bulk assign uses, because
  // a form field is not a permission check.
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .in("role", STAFF_ROLES)
    .eq("status", "active")
    .maybeSingle();
  if (!target) return { ok: false, error: "That person is not an active member of staff in your organisation." };

  const { error: enrolError } = await supabase.from("enrolments").upsert(
    { organisation_id: context.organisationId, user_id: userId, course_id: courseId, due_date: dueDate || null },
    { onConflict: "user_id,course_id" },
  );
  if (enrolError) return { ok: false, error: enrolError.message };

  const { error: linkError } = await supabase.from("complaint_training").insert({
    complaint_id: complaintId,
    user_id: userId,
    course_id: courseId,
    reason: reason || null,
    assigned_by: context.userId,
  });
  // The training is assigned either way; a duplicate link is not a failure
  // worth showing a manager.
  if (linkError && !linkError.message.includes("duplicate")) return { ok: false, error: linkError.message };

  // Told like any other training assignment.
  const origin = await siteOrigin();
  const organisationId = context.organisationId!;
  after(async () => {
    const admin = createAdminClient();
    const { data: course } = await admin.from("courses").select("title").eq("id", courseId).maybeSingle();
    await emailAssignees(
      admin,
      "training_assigned",
      [{ userId, title: (course?.title as string | undefined) ?? "A course", dueDate: dueDate || null, href: "/learn/modules" }],
      { organisationId, assignedBy: context.userId, origin },
    );
  });

  await logAudit({
    context,
    action: "complaint.training_assigned",
    entity: "complaint",
    entityId: complaintId,
    detail: { userId, courseId, reason: reason || null, dueDate: dueDate || null },
  });

  revalidatePath(`/org/staff/${userId}`);
  revalidatePath(`/org/complaints/${complaintId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Legal reminders
// ---------------------------------------------------------------------------

/**
 * A manager confirms a legal reminder — the council, CQC, police, DBS or
 * RIDDOR — is in hand. The site files nothing; this keeps who said so and
 * when. Undo clears it, for a confirmation made by mistake.
 */
export async function confirmReminderAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const key = str(formData, "key");
  const undo = formData.get("undo") === "1";
  if (!(REMINDER_KEYS as readonly string[]).includes(key)) return { ok: false, error: "That is not one of the reminders." };

  const supabase = await createClient();
  const [{ data: row }, { data: me }] = await Promise.all([
    supabase.from("complaints").select("reminders").eq("id", id).maybeSingle(),
    supabase.from("users").select("full_name, email").eq("id", context.userId).maybeSingle(),
  ]);
  if (!row) return { ok: false, error: "That record is no longer there." };
  const reminders = { ...((row.reminders as Record<string, unknown> | null) ?? {}) };
  if (undo) delete reminders[key];
  else reminders[key] = { at: new Date().toISOString(), by: context.userId, byName: (me?.full_name as string | null) || (me?.email as string | null) || null };
  const { error } = await supabase.from("complaints").update({ reminders }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: undo ? "complaint.reminder_undone" : "complaint.reminder_confirmed", entity: "complaint", entityId: id, detail: { key } });
  revalidatePath(`/org/complaints/${id}`);
  return { ok: true };
}

/** The interim update's "what we have found so far", kept so it can be printed again. */
export async function saveInterimFindingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "complaintId");
  const text = str(formData, "interimFindings");
  if (text.length > 10000) return { ok: false, error: "Keep it under 10,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("complaints").update({ interim_findings: text || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/complaints/${id}`);
  return { ok: true };
}
