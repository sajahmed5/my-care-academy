"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import type { SaveState } from "@/app/platform/actions";

/** A save that can say how many people it reached. */
export interface AssignState extends SaveState {
  count?: number;
}

/**
 * Ask people to complete a form.
 *
 * Written through the RLS-scoped client: form_assignments_org_admin is the
 * gate — own organisation, forms.builder — so there is one rule rather than
 * two that can drift. The people are checked against the organisation the
 * same way the bulk training assign does it, because a form field is not a
 * permission check.
 *
 * Someone who already has this form open is skipped rather than asked twice:
 * two open asks for one form is nagging, not evidence.
 *
 * Only learners can be asked (issue #50). An admin cannot open the learner
 * side, so a form assigned to one could never be completed — the same dead
 * end as training assigned to an admin (#35). A manager who wants a form on
 * record completes it themselves: startOwnFormAction.
 */
export async function assignFormAction(
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "forms.builder"))) {
    return { ok: false, error: "The forms library is not included in your plan." };
  }

  const templateId = String(formData.get("templateId") ?? "");
  const everyone = String(formData.get("everyone") ?? "") === "1";
  const picked = formData.getAll("userId").map(String).filter(Boolean);
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!templateId) return { ok: false, error: "No form given." };
  if (!everyone && picked.length === 0) {
    return { ok: false, error: "Choose who should complete it, or everyone." };
  }

  const supabase = await createClient();
  const orgId = context.organisationId!;

  // The organisation's active learners, and who already has this form open —
  // both read by organisation rather than by a list of ids in the URL, which
  // "everyone" in a large organisation would push past the URL limit.
  const [{ data: users }, { data: open }] = await Promise.all([
    supabase
      .from("users")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .eq("role", "learner")
      .limit(1000),
    supabase
      .from("form_assignments")
      .select("user_id")
      .eq("organisation_id", orgId)
      .eq("template_id", templateId)
      .is("completed_at", null)
      .limit(1000),
  ]);
  const wanted = everyone ? null : new Set(picked);
  const userIds = (users ?? []).map((u) => u.id as string).filter((id) => !wanted || wanted.has(id));
  if (userIds.length === 0) return { ok: false, error: "Nobody matched." };

  const alreadyOpen = new Set((open ?? []).map((r) => r.user_id as string));
  const fresh = userIds.filter((id) => !alreadyOpen.has(id));
  if (fresh.length === 0) {
    return { ok: false, error: "Everyone you chose already has this form open." };
  }

  const { error } = await supabase.from("form_assignments").insert(
    fresh.map((user_id) => ({
      organisation_id: context.organisationId,
      template_id: templateId,
      user_id,
      assigned_by: context.userId,
      due_date: dueDate || null,
      note: note || null,
    })),
  );
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "form.assigned",
    entity: "form_template",
    entityId: templateId,
    detail: { people: fresh.length, dueDate: dueDate || null, everyone },
  });

  revalidatePath("/org/forms");
  for (const id of fresh) revalidatePath(`/org/staff/${id}`);
  return { ok: true, count: fresh.length };
}

/**
 * A manager completes a form themselves, now (issue #50).
 *
 * The record is a self-assignment — asked by me, of me, no date — completed
 * through the same page and the same action a carer uses, so the response is
 * the manager's own and sits in the list with everyone else's. One already
 * open is picked up rather than duplicated; it is where "Continue" goes.
 */
export async function startOwnFormAction(formData: FormData): Promise<void> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "forms.builder"))) redirect("/org/forms");

  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) redirect("/org/forms");

  const supabase = await createClient();
  const { data: open } = await supabase
    .from("form_assignments")
    .select("id")
    .eq("template_id", templateId)
    .eq("user_id", context.userId)
    .is("completed_at", null)
    .limit(1)
    .maybeSingle();
  if (open) redirect(`/org/forms/complete/${open.id as string}`);

  const { data: created, error } = await supabase
    .from("form_assignments")
    .insert({
      organisation_id: context.organisationId,
      template_id: templateId,
      user_id: context.userId,
      assigned_by: context.userId,
    })
    .select("id")
    .single();
  if (error || !created) redirect("/org/forms");

  await logAudit({
    context,
    action: "form.started_own",
    entity: "form_assignment",
    entityId: created.id as string,
    detail: { templateId },
  });

  revalidatePath("/org/forms");
  redirect(`/org/forms/complete/${created.id as string}`);
}

/** Withdraw an open ask. A completed one is a record and stays. */
export async function unassignFormAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireConsole();
  const id = String(formData.get("assignmentId") ?? "");
  if (!id) return { ok: false, error: "No assignment given." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("form_assignments")
    .delete({ count: "exact" })
    .eq("id", id)
    .is("completed_at", null);
  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: "That ask has already been completed, or is not yours." };

  await logAudit({ context, action: "form.unassigned", entity: "form_assignment", entityId: id });
  revalidatePath("/org/forms");
  return { ok: true };
}
