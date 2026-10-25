"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
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
  completeByFor,
  kindOf,
  stagesFor,
} from "@/lib/complaints/stages";
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
import { siteOrigin } from "@/lib/site-url";

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
  const context = await requireComplaints();
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
  revalidatePath("/org/complaints/stages");
  return { ok: true };
}

export async function saveStageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
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
  revalidatePath("/org/complaints/stages");
  revalidatePath("/org/complaints");
  return { ok: true };
}

export async function deleteStageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
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
    revalidatePath("/org/complaints/stages");
    return { ok: true, error: undefined };
  }
  const { error } = await supabase.from("complaint_stages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/complaints/stages");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export async function createComplaintAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireComplaints();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const kind = kindOf(str(formData, "kind"));
  const raisedByName = str(formData, "raisedByName");
  const raisedByRole = str(formData, "raisedByRole");
  const aboutName = str(formData, "aboutName");
  const reportedOn = str(formData, "reportedOn") || today();
  const occurredOn = str(formData, "occurredOn");
  const description = str(formData, "description");
  const desiredOutcome = str(formData, "desiredOutcome");
  const staff = formData.getAll("staff").map(String).filter(Boolean);

  if (!description) return { ok: false, error: "Say what was raised." };
  if (description.length > 10000) return { ok: false, error: "Keep it under 10,000 characters." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportedOn)) return { ok: false, error: "Say when it reached you." };
  if (raisedByRole && !RAISED_BY_ROLES.some((r) => r.value === raisedByRole)) {
    return { ok: false, error: "Pick who raised it." };
  }

  const supabase = await createClient();
  const [allStages, reference] = await Promise.all([
    loadStages(supabase, context.organisationId),
    nextReference(supabase, kind, reportedOn),
  ]);
  const stages = stagesFor(allStages, kind);
  if (stages.length === 0) return { ok: false, error: "Set up the process first: the organisation has no stages yet." };

  const { data: row, error } = await supabase
    .from("complaints")
    .insert({
      organisation_id: context.organisationId,
      reference,
      kind,
      raised_by_name: raisedByName || null,
      raised_by_role: raisedByRole || null,
      about_name: aboutName || null,
      reported_on: reportedOn,
      occurred_on: occurredOn || null,
      // Only a complaint carries the 28-day clock. An issue or a safeguarding
      // concern has no statutory response date, and a fabricated one would
      // show up red for no reason.
      complete_by: kind === "complaint" ? completeByFor(reportedOn) : null,
      description,
      desired_outcome: desiredOutcome || null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const complaintId = row.id as string;

  if (staff.length) {
    await supabase
      .from("complaint_people")
      .insert(staff.map((userId) => ({ complaint_id: complaintId, user_id: userId, involvement: "involved" })));
  }

  // What was typed here IS the complaint form, so the first stage starts
  // filled in rather than asking for the same facts a second time.
  const form = stages.find((s) => s.kind === "complaint_form");
  if (form) {
    const answers: Record<string, unknown> = {
      cf_date: occurredOn || reportedOn,
      cf_complainant: raisedByName,
      cf_relationship: raisedByRole || undefined,
      cf_about: aboutName || undefined,
      cf_nature: staff.length ? "carer" : undefined,
      cf_details: description,
      cf_staff: staff,
      cf_desired: desiredOutcome || undefined,
      cf_recorded_by: context.email ?? undefined,
    };
    await recompute(supabase, complaintId, form, answers, context.userId);
  }

  await logAudit({
    context,
    action: "complaint.recorded",
    entity: "complaint",
    entityId: complaintId,
    detail: { kind, reference, staff },
  });

  revalidatePath("/org/complaints");
  redirect(`/org/complaints/${complaintId}`);
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
  const triaged = !triage || complaint.stageEntries.some((e) => e.stageId === triage.id && e.status !== "pending");
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

  // Tell the owner (#66). A console user can open the record; a carer has no
  // page for it, so theirs says who to ask.
  const origin = await siteOrigin();
  const organisationId = context.organisationId!;
  after(async () => {
    const admin = createAdminClient();
    const { data: owner } = await admin.from("users").select("role").eq("id", ownerId).maybeSingle();
    const inConsole = owner?.role === "org_admin" || owner?.role === "org_office";
    await emailAssignees(
      admin,
      "action_assigned",
      [{ userId: ownerId, title, dueDate, href: inConsole ? `/org/complaints/${complaintId}` : null, note: detail || null }],
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
