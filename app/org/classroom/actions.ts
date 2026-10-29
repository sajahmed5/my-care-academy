"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { completeInPerson } from "@/lib/in-person-completion";
import { formatDate } from "@/lib/dates";
import type { SaveState } from "@/app/platform/actions";

export interface ClassroomState extends SaveState {
  certificates?: number;
}

/**
 * Record a classroom session and who attended (ROADMAP §4).
 *
 * The session and its attendance are written as the console user, under RLS.
 * When it covers a library course, each attendee's enrolment is completed and
 * a certificate issued as the service role — the same certificate a quiz pass
 * earns, dated the day of the session, with a line saying it was classroom
 * training — so the matrix, renewal reminders and the evidence pack treat it
 * like any other completion.
 */
export async function recordClassroomSessionAction(_prev: ClassroomState, formData: FormData): Promise<ClassroomState> {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  const orgId = context.organisationId!;
  const title = String(formData.get("title") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim() || null;
  const heldOn = String(formData.get("heldOn") ?? "").trim();
  const trainer = String(formData.get("trainer") ?? "").trim();
  const duration = Number(formData.get("duration") ?? "") || null;
  const location = String(formData.get("location") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const attendees = [...new Set(formData.getAll("attendee").map(String).filter(Boolean))];

  if (!title) return { ok: false, error: "Say what the session was." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { ok: false, error: "Say when it was held." };
  if (heldOn > new Date().toISOString().slice(0, 10)) return { ok: false, error: "Record a session once it has happened." };
  if (attendees.length === 0) return { ok: false, error: "Tick who attended." };
  if (duration !== null && (duration < 1 || duration > 2880)) return { ok: false, error: "Give the length in minutes." };

  const supabase = await createClient();
  // Attendees must be this organisation's active staff: a ticked box is not a permission check.
  const { data: staff } = await supabase
    .from("users")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("status", "active")
    .in("id", attendees.slice(0, 300));
  const valid = (staff ?? []).map((u) => u.id as string);
  if (valid.length === 0) return { ok: false, error: "None of those people are current staff." };

  const { data: session, error } = await supabase
    .from("classroom_sessions")
    .insert({
      organisation_id: orgId,
      title,
      course_id: courseId,
      held_on: heldOn,
      trainer_name: trainer || null,
      duration_minutes: duration,
      location: location || null,
      notes: notes || null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { error: attErr } = await supabase
    .from("classroom_attendance")
    .insert(valid.map((user_id) => ({ session_id: session.id, organisation_id: orgId, user_id })));
  if (attErr) return { ok: false, error: `The session saved, but not who attended: ${attErr.message}` };

  let certificates = 0;
  if (courseId) {
    const admin = createAdminClient();
    const note = `Completed in a classroom session on ${formatDate(heldOn, { day: "numeric", month: "long", year: "numeric" })}${trainer ? ` with ${trainer}` : ""}.`;
    const issued = await completeInPerson({ admin, organisationId: orgId, userIds: valid, courseId, heldOn, note });
    for (const [userId, certificateId] of issued) {
      certificates++;
      await admin
        .from("classroom_attendance")
        .update({ certificate_id: certificateId })
        .eq("session_id", session.id)
        .eq("user_id", userId);
    }
  }

  await logAudit({
    context,
    action: "classroom.recorded",
    entity: "classroom_session",
    entityId: session.id as string,
    detail: { title, heldOn, attendees: valid.length, courseId, certificates },
  });
  revalidatePath("/org/classroom");
  revalidatePath("/org");
  revalidatePath("/org/learners");
  for (const id of valid) revalidatePath(`/org/staff/${id}`);
  return { ok: true, certificates };
}
