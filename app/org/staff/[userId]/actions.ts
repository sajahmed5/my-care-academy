"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { parseAgreedActions } from "@/lib/records";
import { COMPETENCY_AREAS, COMPETENCY_OUTCOMES } from "@/lib/competency";
import { SUPERVISION_KINDS, carerSignature } from "@/lib/supervisions";
import type { SaveState } from "@/app/platform/actions";

/** A save that can also say how many agreed actions it created. */
export interface SupervisionState extends SaveState {
  count?: number;
}

/**
 * Actions on a carer's file — the written-down half of their task list.
 *
 * Written through the RLS-scoped client rather than the service role, as
 * saveTierCompositionAction is: the record_actions policies already say an
 * org_admin may write only within their own organisation, so letting them be
 * the gate means there is one rule rather than two that can drift apart.
 *
 * The scope check below is still needed, and is about something else: RLS
 * stamps the row's organisation, but nothing stops a crafted form naming a
 * carer from a different one.
 */

const MAX_TITLE = 200;
const MAX_DETAIL = 2000;

export async function addPersonActionAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireConsole();

  const userId = String(formData.get("userId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();

  if (!title) return { ok: false, error: "Give the action a title." };
  if (title.length > MAX_TITLE) {
    return { ok: false, error: `Keep the title under ${MAX_TITLE} characters.` };
  }
  if (detail.length > MAX_DETAIL) {
    return { ok: false, error: `Keep the detail under ${MAX_DETAIL} characters.` };
  }

  const supabase = await createClient();

  // The carer must be one of theirs. org_admin_reads_org_users scopes this
  // read, so a user from another organisation simply is not found.
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "That person is not in your organisation." };

  const { error } = await supabase.from("record_actions").insert({
    organisation_id: context.organisationId,
    user_id: userId,
    title,
    detail: detail || null,
    due_date: dueDate || null,
    source_type: "manual",
    created_by: context.userId,
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "action.added",
    entity: "user",
    entityId: userId,
    detail: { title, dueDate: dueDate || null },
  });

  revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

/**
 * Tick an action off, or put it back.
 *
 * Only stored actions can be ticked. Training and certificate renewals are
 * derived from their own records and are completed by doing them — a tick
 * that said otherwise would be contradicted by the training record on the
 * same page.
 */
export async function setPersonActionDoneAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireConsole();

  const actionId = String(formData.get("actionId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const done = String(formData.get("done") ?? "") === "1";
  if (!actionId) return { ok: false, error: "No action given." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("record_actions")
    .update(
      done
        ? { completed_at: new Date().toISOString(), completed_by: context.userId }
        : { completed_at: null, completed_by: null },
      { count: "exact" },
    )
    .eq("id", actionId);
  if (error) return { ok: false, error: error.message };
  // RLS filtered it out: it belongs to another organisation, or has gone.
  if (count === 0) return { ok: false, error: "That action is no longer there." };

  await logAudit({
    context,
    action: done ? "action.completed" : "action.reopened",
    entity: "record_action",
    entityId: actionId,
  });

  if (userId) revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

/**
 * Record a supervision, an appraisal or a review, with what was agreed.
 *
 * The agreed actions become record_actions rather than a paragraph in the
 * summary: the point of writing them down is that somebody chases them, and
 * nothing chases a sentence. They land in the same list as the carer's
 * training, which is the whole idea of the file.
 *
 * The supervision and its actions are two writes, not one transaction.
 * PostgREST has no transaction across calls, so the order matters: the record
 * goes in first, and an action that fails to save leaves a supervision with
 * one fewer action — recoverable, and visible. The other order would lose the
 * record and keep the actions, which is neither.
 */
export async function addSupervisionAction(
  _prev: SupervisionState,
  formData: FormData,
): Promise<SupervisionState> {
  const context = await requireConsole();

  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("kind") ?? "supervision");
  const heldOn = String(formData.get("heldOn") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const nextDue = String(formData.get("nextDue") ?? "").trim();
  const agreed = parseAgreedActions(String(formData.get("agreed") ?? ""));
  const actionsDue = String(formData.get("actionsDue") ?? "").trim();
  // Signed on the manager's screen at the time (CARER-FILE.md §9), or a
  // reason it could not be.
  const signed = carerSignature({
    signature: String(formData.get("carerSignature") ?? ""),
    name: String(formData.get("carerSignedName") ?? ""),
    unsignedReason: formData.get("carerCannotSign") === "1" ? String(formData.get("carerUnsignedReason") ?? "") : "",
    now: new Date(),
  });

  if (!heldOn) return { ok: false, error: "Say when it was held." };
  if (!SUPERVISION_KINDS.some((k) => k.value === kind)) {
    return { ok: false, error: "Pick what kind of record this is." };
  }
  if (summary.length > 5000) {
    return { ok: false, error: "Keep the summary under 5000 characters." };
  }
  if (formData.get("carerCannotSign") === "1" && !String(formData.get("carerUnsignedReason") ?? "").trim()) {
    return { ok: false, error: "Say why they cannot sign now." };
  }
  if (!signed.ok) return { ok: false, error: signed.error };

  // Said plainly, rather than leaving RLS to refuse the insert and reporting
  // "new row violates row-level security policy" to a care manager.
  if (!(await hasFeature(context, "people.supervisions"))) {
    return { ok: false, error: "Supervisions are not included in your plan." };
  }

  const supabase = await createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "That person is not in your organisation." };

  const { data: row, error } = await supabase
    .from("supervisions")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      supervisor_id: context.userId,
      kind,
      held_on: heldOn,
      summary: summary || null,
      next_due: nextDue || null,
      created_by: context.userId,
      ...signed.fields,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (agreed.length) {
    const { error: actionError } = await supabase.from("record_actions").insert(
      agreed.map((title) => ({
        organisation_id: context.organisationId,
        user_id: userId,
        title,
        due_date: actionsDue || null,
        source_type: "supervision",
        source_id: row.id,
        created_by: context.userId,
      })),
    );
    if (actionError) {
      return {
        ok: false,
        error: `Saved the record, but the agreed actions did not save: ${actionError.message}`,
      };
    }
  }

  await logAudit({
    context,
    action: "supervision.recorded",
    entity: "user",
    entityId: userId,
    detail: { kind, heldOn, actions: agreed.length, signedByCarer: !!signed.fields.carer_signature },
  });

  revalidatePath(`/org/staff/${userId}`);
  return { ok: true, count: agreed.length };
}

/**
 * Record a spot check.
 *
 * The same shape as a supervision — dated, by somebody, about somebody, with
 * what follows from it becoming actions — and deliberately so: a manager who
 * has recorded one has learned how to record the other.
 *
 * The area is whatever the UI offered (lib/competency.ts), not a database
 * enum, so an organisation that checks something we have not thought of is
 * not stuck. The outcome is constrained, because reports count it.
 */
export async function addCompetencyCheckAction(
  _prev: SupervisionState,
  formData: FormData,
): Promise<SupervisionState> {
  const context = await requireConsole();

  const userId = String(formData.get("userId") ?? "");
  const area = String(formData.get("area") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "");
  const checkedOn = String(formData.get("checkedOn") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const nextDue = String(formData.get("nextDue") ?? "").trim();
  const agreed = parseAgreedActions(String(formData.get("agreed") ?? ""));
  const actionsDue = String(formData.get("actionsDue") ?? "").trim();

  if (!checkedOn) return { ok: false, error: "Say when it was checked." };
  if (!COMPETENCY_AREAS.some((a) => a.value === area)) {
    return { ok: false, error: "Pick what was checked." };
  }
  if (!COMPETENCY_OUTCOMES.some((o) => o.value === outcome)) {
    return { ok: false, error: "Pick how it went." };
  }
  if (notes.length > 5000) {
    return { ok: false, error: "Keep the notes under 5000 characters." };
  }

  if (!(await hasFeature(context, "people.competency"))) {
    return { ok: false, error: "Spot checks are not included in your plan." };
  }

  const supabase = await createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "That person is not in your organisation." };

  const { data: row, error } = await supabase
    .from("competency_checks")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      assessor_id: context.userId,
      area,
      outcome,
      checked_on: checkedOn,
      notes: notes || null,
      next_due: nextDue || null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (agreed.length) {
    const { error: actionError } = await supabase.from("record_actions").insert(
      agreed.map((title) => ({
        organisation_id: context.organisationId,
        user_id: userId,
        title,
        due_date: actionsDue || null,
        source_type: "competency",
        source_id: row.id,
        created_by: context.userId,
      })),
    );
    if (actionError) {
      return {
        ok: false,
        error: `Saved the check, but the actions did not save: ${actionError.message}`,
      };
    }
  }

  await logAudit({
    context,
    action: "competency.recorded",
    entity: "user",
    entityId: userId,
    detail: { area, outcome, checkedOn, actions: agreed.length },
  });

  revalidatePath(`/org/staff/${userId}`);
  return { ok: true, count: agreed.length };
}
