"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { SaveState } from "@/app/platform/actions";

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
  const context = await requireRole("org_admin");

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
  const context = await requireRole("org_admin");

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
