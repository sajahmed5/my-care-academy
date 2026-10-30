"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { managerSignature } from "@/lib/supervisions";
import { parseAgreedActions } from "@/lib/records";
import { needsReview, readItems, type AuditItem } from "@/lib/service-audits";
import { loadQaForm, loadReviewBelow } from "@/lib/service-audits-data";
import { QA_HEADINGS, qaConcernText, qaScore, qaWho, readRatings, type QaHeading } from "@/lib/client-qa";
import { nextReference } from "@/lib/complaints/data";
import { computeStageStatus } from "@/lib/complaints/compute";
import { UNTRIAGED } from "@/lib/complaints/stages";
import type { SaveState } from "@/app/platform/actions";

/**
 * Client QAs (SERVICE-AUDITS.md). Carried out by managers and office, by
 * visit or phone; signed off by whoever did it. One scoring below the
 * company's level waits for a manager to review it. From a QA, in one click,
 * praise goes to the compliments log and a problem is raised as a concern
 * that links back — both only where complaints are in the package.
 */

const NOT_IN_PLAN = "Client QAs are not included in your plan.";
const NO_COMPLAINTS = "Compliments and concerns are not included in your plan.";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);

function json(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    return null;
  }
}

export async function saveClientQaAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: NOT_IN_PLAN };
  const orgId = context.organisationId!;
  const clientId = str(formData, "clientId");
  const heldOn = str(formData, "heldOn");
  const method = str(formData, "method");
  const completed = str(formData, "completed") !== "0";
  const nextDue = str(formData, "nextDue");
  if (!clientId) return { ok: false, error: "Pick the client." };
  if (!ISO_DATE.test(heldOn) || heldOn > today()) return { ok: false, error: "Say when it was done — today or before." };
  if (method !== "visit" && method !== "phone") return { ok: false, error: "Was it a visit or a phone call?" };

  const supabase = await createClient();
  const [{ data: client }, form, reviewBelow] = await Promise.all([
    supabase.from("clients").select("full_name, medication_support").eq("id", clientId).eq("organisation_id", orgId).maybeSingle(),
    loadQaForm(orgId),
    loadReviewBelow(orgId),
  ]);
  if (!client) return { ok: false, error: "That client is not on your client list." };

  const signed = managerSignature({ signature: str(formData, "managerSignature"), name: str(formData, "managerSignedName"), now: new Date() });
  if (!signed.ok) return { ok: false, error: signed.error };

  const base = {
    organisation_id: orgId,
    client_id: clientId,
    client_name: client.full_name as string,
    held_on: heldOn,
    method,
    next_due: ISO_DATE.test(nextDue) ? nextDue : null,
    auditor_id: context.userId,
    auditor_signature: signed.fields.manager_signature,
    auditor_signed_name: signed.fields.manager_signed_name,
    auditor_signed_at: signed.fields.manager_signed_at,
    review_below: reviewBelow,
    created_by: context.userId,
  };

  let row: Record<string, unknown>;
  let agreed: string[] = [];
  let owner = "";
  if (!completed) {
    // Couldn't be done: why, and it still counts as attempted.
    const reason = str(formData, "notDoneReason");
    if (!reason) return { ok: false, error: "Say why it couldn't be done." };
    row = { ...base, completed: false, not_done_reason: reason.slice(0, 1000) };
  } else {
    const withWhom = str(formData, "withWhom");
    if (withWhom !== "client" && withWhom !== "family") return { ok: false, error: "Say who it was with." };
    const relationship = str(formData, "familyRelationship").slice(0, 80);
    if (withWhom === "family" && !relationship) return { ok: false, error: "Say how the family member is related to the client." };
    const ratings = readRatings(Object.fromEntries(QA_HEADINGS.map((h) => [h.key, str(formData, `rating_${h.key}`)])));
    if (!ratings.ok) return { ok: false, error: ratings.error };
    let medication: AuditItem[] = [];
    if (client.medication_support && form.medication.length) {
      const read = readItems(form.medication, json(formData, "medication"));
      if (!read.ok) return { ok: false, error: read.error };
      medication = read.items;
    }
    const own = readItems(form.own, json(formData, "extra"));
    if (!own.ok) return { ok: false, error: own.error };
    const texts = ["wentWell", "doBetter", "actionPlan"].map((k) => str(formData, k));
    if (texts.some((t) => t.length > 5000)) return { ok: false, error: "Keep each answer under 5,000 characters." };
    agreed = parseAgreedActions(String(formData.get("agreed") ?? ""));
    owner = str(formData, "actionOwner");
    if (agreed.length && !owner) return { ok: false, error: "Say who the actions are for." };
    if (owner) {
      const { data: staff } = await supabase.from("users").select("id").eq("id", owner).eq("organisation_id", orgId).maybeSingle();
      if (!staff) return { ok: false, error: "Pick the actions' owner from your own staff." };
    }
    const score = qaScore(ratings.ratings);
    row = {
      ...base,
      completed: true,
      with_whom: withWhom,
      family_name: withWhom === "family" ? str(formData, "familyName").slice(0, 120) || null : null,
      family_relationship: withWhom === "family" ? relationship : null,
      ...ratings.ratings,
      medication,
      extra: own.items,
      went_well: texts[0] || null,
      do_better: texts[1] || null,
      action_plan: texts[2] || null,
      score,
      review_status: needsReview(score, reviewBelow) ? "waiting" : "not_needed",
    };
  }

  const { data: qa, error } = await supabase.from("client_qas").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  const qaId = qa.id as string;

  if (agreed.length) {
    const due = str(formData, "actionsDue");
    const { error: actError } = await supabase.from("record_actions").insert(
      agreed.map((title) => ({
        organisation_id: orgId,
        user_id: owner,
        title: `Client QA (${client.full_name}): ${title}`.slice(0, 200),
        due_date: ISO_DATE.test(due) ? due : null,
        source_type: "client_qa",
        source_id: qaId,
        created_by: context.userId,
      })),
    );
    if (actError) return { ok: false, error: `The QA saved, but its actions did not: ${actError.message}` };
  }

  await logAudit({
    context,
    action: "client_qa.recorded",
    entity: "client_qa",
    entityId: qaId,
    detail: { completed, score: (row.score as number | undefined) ?? null, actions: agreed.length },
  });
  revalidatePath("/org/audits");
  revalidatePath("/org/due/audits");
  revalidatePath(`/org/clients/${clientId}`);
  redirect(`/org/audits/qa/${qaId}`);
}

export async function reviewQaAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "id");
  const note = str(formData, "note");
  if (!note) return { ok: false, error: "Say what you found, and what happens next." };
  if (note.length > 3000) return { ok: false, error: "Keep it under 3,000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_qas")
    .update({ review_status: "reviewed", reviewed_by: context.userId, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", id)
    .eq("review_status", "waiting")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That QA isn't waiting for review." };
  await logAudit({ context, action: "client_qa.reviewed", entity: "client_qa", entityId: id });
  revalidatePath(`/org/audits/qa/${id}`);
  revalidatePath("/org/audits");
  return { ok: true };
}

type Gate = { context: Awaited<ReturnType<typeof requireConsole>>; supabase: Awaited<ReturnType<typeof createClient>> };

async function complaintsGate(): Promise<Gate | null> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.audits")) || !(await hasFeature(context, "complaints.register"))) return null;
  return { context, supabase: await createClient() };
}

const QA_SELECT =
  "id, client_id, client_name, held_on, method, with_whom, family_name, family_relationship, completed, safe, effective, caring, responsive, well_led, medication, went_well, do_better, action_plan, compliment_id, complaint_id";

/** The praise in a QA, to the compliments log, linked to the staff it is about. */
export async function qaComplimentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const gate = await complaintsGate();
  if (!gate) return { ok: false, error: NO_COMPLAINTS };
  const { context, supabase } = gate;
  const id = str(formData, "id");
  const people = [...new Set(formData.getAll("people").map(String).filter(Boolean))];
  const { data: qa } = await supabase.from("client_qas").select(QA_SELECT).eq("id", id).maybeSingle();
  if (!qa) return { ok: false, error: "That QA is no longer there." };
  if (qa.compliment_id) return { ok: false, error: "This praise is already in the compliments log." };
  if (!(qa.went_well as string | null)?.trim()) return { ok: false, error: "Nothing was said about what we do well." };
  if (people.length) {
    const { data: staff } = await supabase.from("users").select("id").in("id", people).eq("organisation_id", context.organisationId!);
    if ((staff ?? []).length !== people.length) return { ok: false, error: "Pick staff from your own organisation." };
  }
  const { data: compliment, error } = await supabase
    .from("compliments")
    .insert({
      organisation_id: context.organisationId,
      received_on: qa.held_on,
      from_name: qaWho(qa as never).slice(0, 120),
      from_role: qa.with_whom === "family" ? "family" : "client",
      client_id: qa.client_id,
      what_was_said: qa.went_well,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (people.length) {
    const { error: pErr } = await supabase.from("compliment_people").insert(people.map((user_id) => ({ compliment_id: compliment.id, user_id })));
    if (pErr) return { ok: false, error: `Logged it, but could not link the staff: ${pErr.message}` };
  }
  await supabase.from("client_qas").update({ compliment_id: compliment.id }).eq("id", id);
  await logAudit({ context, action: "client_qa.compliment", entity: "client_qa", entityId: id, detail: { complimentId: compliment.id, people: people.length } });
  revalidatePath(`/org/audits/qa/${id}`);
  revalidatePath("/org/complaints/compliments");
  for (const p of people) revalidatePath(`/org/staff/${p}`);
  if (qa.client_id) revalidatePath(`/org/clients/${qa.client_id}`);
  return { ok: true };
}

/**
 * A problem in a QA, raised as a concern waiting for triage, about the
 * client, in the words of whoever the QA was with. The concern links back.
 */
export async function qaConcernAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const gate = await complaintsGate();
  if (!gate) return { ok: false, error: NO_COMPLAINTS };
  const { context, supabase } = gate;
  const id = str(formData, "id");
  const { data: qa } = await supabase.from("client_qas").select(QA_SELECT).eq("id", id).maybeSingle();
  if (!qa) return { ok: false, error: "That QA is no longer there." };
  if (qa.complaint_id) redirect(`/org/complaints/${qa.complaint_id}`);
  if (!qa.completed) return { ok: false, error: "This QA wasn't done, so there is nothing to raise from it." };

  const orgId = context.organisationId!;
  const reportedOn = today();
  const description = qaConcernText({
    held_on: qa.held_on as string,
    method: qa.method as string,
    do_better: qa.do_better as string | null,
    action_plan: qa.action_plan as string | null,
    ratings: Object.fromEntries(QA_HEADINGS.map((h) => [h.key, qa[h.key as QaHeading] as number | null])),
    medication: (qa.medication as AuditItem[] | null) ?? [],
  });
  const raisedBy = qaWho(qa as never);
  const role = qa.with_whom === "family" ? "family" : "client";
  const reference = await nextReference(supabase, UNTRIAGED, reportedOn, orgId);
  const { data: row, error } = await supabase
    .from("complaints")
    .insert({
      organisation_id: orgId,
      reference,
      kind: UNTRIAGED,
      raised_by_name: raisedBy,
      raised_by_role: role,
      about_name: qa.client_name,
      client_id: qa.client_id,
      reported_on: reportedOn,
      occurred_on: qa.held_on,
      description,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // What the QA says is the Complaint Form, as when the office raises one.
  const { data: stage } = await supabase
    .from("complaint_stages")
    .select("id, name, kind")
    .eq("organisation_id", orgId)
    .eq("kind", "complaint_form")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (stage) {
    const answers: Record<string, unknown> = {
      cf_date: reportedOn,
      cf_complainant: raisedBy,
      cf_relationship: role,
      cf_about: qa.client_name,
      cf_details: description,
      cf_recorded_by: context.email ?? undefined,
    };
    await supabase.from("complaint_stage_entries").insert({
      complaint_id: row.id,
      stage_id: stage.id,
      form_answers: answers,
      status: computeStageStatus(stage as { name: string; kind: string }, answers, []) ?? "pending",
    });
  }
  await supabase.from("client_qas").update({ complaint_id: row.id }).eq("id", id);
  await logAudit({ context, action: "client_qa.concern", entity: "client_qa", entityId: id, detail: { complaintId: row.id, reference } });
  revalidatePath("/org/complaints");
  revalidatePath(`/org/audits/qa/${id}`);
  if (qa.client_id) revalidatePath(`/org/clients/${qa.client_id}`);
  redirect(`/org/complaints/${row.id}`);
}
