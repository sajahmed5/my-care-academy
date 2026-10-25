"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailAssignees } from "@/lib/assignment-email";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
} from "@/lib/incidents";
import type { SaveState } from "@/app/platform/actions";

/**
 * Complaints, accidents and safeguarding concerns.
 *
 * Written through the RLS-scoped client, so the incidents policies — org
 * admin, own organisation, complaints.register — are the gate. The feature is
 * also checked here so a care manager sees "not included in your plan" rather
 * than a row-level security error.
 */

async function requireRegister() {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return null;
  return context;
}

export async function addIncidentAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRegister();
  if (!context) {
    return { ok: false, error: "The complaints register is not included in your plan." };
  }

  const kind = String(formData.get("kind") ?? "");
  const category = String(formData.get("category") ?? "");
  const occurredOn = String(formData.get("occurredOn") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  // Optional: the carer this was recorded from, tagged as involved.
  const userId = String(formData.get("userId") ?? "").trim();

  if (!INCIDENT_KINDS.some((k) => k.value === kind)) {
    return { ok: false, error: "Pick what kind of record this is." };
  }
  if (!INCIDENT_CATEGORIES.some((c) => c.value === category)) {
    return { ok: false, error: "Pick what it was about." };
  }
  if (!occurredOn) return { ok: false, error: "Say when it happened." };
  if (!summary) return { ok: false, error: "Say what happened." };
  if (summary.length > 5000) {
    return { ok: false, error: "Keep the summary under 5000 characters." };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("incidents")
    .insert({
      organisation_id: context.organisationId,
      kind,
      category,
      occurred_on: occurredOn,
      summary,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (userId) {
    const { error: linkError } = await supabase
      .from("incident_people")
      .insert({ incident_id: row.id, user_id: userId, involvement: "involved" });
    if (linkError) {
      return {
        ok: false,
        error: `Recorded it, but could not tag that person: ${linkError.message}`,
      };
    }
  }

  await logAudit({
    context,
    action: "incident.recorded",
    entity: "incident",
    entityId: row.id as string,
    detail: { kind, category, occurredOn, tagged: userId || null },
  });

  revalidatePath("/org/incidents");
  if (userId) revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

/** Move an incident along, and record what came of it when it closes. */
export async function setIncidentStatusAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRegister();
  if (!context) {
    return { ok: false, error: "The complaints register is not included in your plan." };
  }

  const incidentId = String(formData.get("incidentId") ?? "");
  const status = String(formData.get("status") ?? "");
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (!incidentId) return { ok: false, error: "No record given." };
  if (!INCIDENT_STATUSES.some((s) => s.value === status)) {
    return { ok: false, error: "Pick a status." };
  }
  if (status === "closed" && !outcome) {
    return { ok: false, error: "Say what came of it before closing it." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("incidents")
    .update(
      {
        status,
        outcome: outcome || null,
        // Reopening clears the closing date rather than leaving a date on
        // something that is open again.
        closed_on: status === "closed" ? new Date().toISOString().slice(0, 10) : null,
      },
      { count: "exact" },
    )
    .eq("id", incidentId);
  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: "That record is no longer there." };

  await logAudit({
    context,
    action: "incident.status",
    entity: "incident",
    entityId: incidentId,
    detail: { status },
  });

  revalidatePath("/org/incidents");
  return { ok: true };
}

/**
 * Assign a suggested course, because a manager decided to.
 *
 * This is the whole reason suggestions are suggestions. The enrolment is
 * created the same way the bulk assign creates one, and incident_training
 * records who decided and why — so the record reads "the manager reviewed it
 * and assigned refresher training on the 3rd", not "the system assigned
 * training on receipt of a complaint".
 */
export async function assignSuggestedTrainingAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRegister();
  if (!context) {
    return { ok: false, error: "The complaints register is not included in your plan." };
  }

  const incidentId = String(formData.get("incidentId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (!incidentId || !userId || !courseId) {
    return { ok: false, error: "Missing the record, the person or the course." };
  }

  const supabase = await createClient();

  // The carer must be one of theirs, and a learner: the same guard the bulk
  // assign uses, because a form field is not a permission check.
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("role", "learner")
    .eq("status", "active")
    .maybeSingle();
  if (!target) {
    return { ok: false, error: "That person is not an active carer in your organisation." };
  }

  const { error: enrolError } = await supabase.from("enrolments").upsert(
    {
      organisation_id: context.organisationId,
      user_id: userId,
      course_id: courseId,
      due_date: dueDate || null,
    },
    { onConflict: "user_id,course_id" },
  );
  if (enrolError) return { ok: false, error: enrolError.message };

  const { error: linkError } = await supabase.from("incident_training").insert({
    incident_id: incidentId,
    user_id: userId,
    course_id: courseId,
    reason: reason || null,
    assigned_by: context.userId,
  });
  // The training is assigned either way; a duplicate link is not a failure
  // worth showing a manager.
  if (linkError && !linkError.message.includes("duplicate")) {
    return { ok: false, error: linkError.message };
  }

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
    action: "incident.training_assigned",
    entity: "incident",
    entityId: incidentId,
    detail: { userId, courseId, reason: reason || null, dueDate: dueDate || null },
  });

  revalidatePath(`/org/staff/${userId}`);
  revalidatePath("/org/incidents");
  return { ok: true };
}
