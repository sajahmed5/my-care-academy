"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
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
 */
export async function assignFormAction(
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const context = await requireRole("org_admin");
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

  let people = supabase.from("users").select("id").eq("status", "active").in("role", ["learner", "org_admin"]);
  if (!everyone) people = people.in("id", picked);
  const { data: users } = await people;
  const userIds = (users ?? []).map((u) => u.id as string);
  if (userIds.length === 0) return { ok: false, error: "Nobody matched." };

  const { data: open } = await supabase
    .from("form_assignments")
    .select("user_id")
    .eq("template_id", templateId)
    .is("completed_at", null)
    .in("user_id", userIds);
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

/** Withdraw an open ask. A completed one is a record and stays. */
export async function unassignFormAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("org_admin");
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
