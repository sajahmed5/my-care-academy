"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { completeInPerson } from "@/lib/in-person-completion";
import { formatDate } from "@/lib/dates";
import { siteOrigin } from "@/lib/site-url";
import { ukDay } from "@/lib/face-to-face";
import { SIGN_IN_HOURS, hashSignInToken, newSignInToken, signInPath } from "@/lib/classroom-sign-in";
import type { SaveState } from "@/app/platform/actions";

export interface ClassroomState extends SaveState {
  certificates?: number;
}

/**
 * Record a classroom session and who attended (ROADMAP §4), after the fact.
 *
 * The session and its attendance are written as the console user, under RLS.
 * When it covers a library course, each attendee who passed the practical
 * (29 Oct 2026) has their enrolment completed and a certificate issued as the
 * service role — the same certificate a quiz pass earns, dated the day of the
 * session, with a line saying it was classroom training — so the matrix,
 * renewal reminders and the evidence pack treat it like any other completion.
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
  // Each person's practical result (29 Oct 2026): passed or not.
  const practical = new Map<string, boolean>();
  for (const id of attendees) {
    const r = String(formData.get(`practical:${id}`) ?? "");
    if (r !== "passed" && r !== "not_passed") return { ok: false, error: "Give each person's practical result." };
    practical.set(id, r === "passed");
  }

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
    .insert(valid.map((user_id) => ({ session_id: session.id, organisation_id: orgId, user_id, practical_passed: practical.get(user_id) })));
  if (attErr) return { ok: false, error: `The session saved, but not who attended: ${attErr.message}` };

  let certificates = 0;
  if (courseId) {
    const admin = createAdminClient();
    const note = `Completed in a classroom session on ${formatDate(heldOn, { day: "numeric", month: "long", year: "numeric" })}${trainer ? ` with ${trainer}` : ""}.`;
    const passed = valid.filter((id) => practical.get(id));
    const issued = await completeInPerson({ admin, organisationId: orgId, userIds: passed, courseId, heldOn, note: `${note} Practical assessment passed.` });
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
    detail: { title, heldOn, attendees: valid.length, passed: valid.filter((id) => practical.get(id)).length, courseId, certificates },
  });
  revalidatePath("/org/classroom");
  revalidatePath("/org");
  revalidatePath("/org/learners");
  for (const id of valid) revalidatePath(`/org/staff/${id}`);
  return { ok: true, certificates };
}

/**
 * Start a session people sign in to by QR code (29 Oct 2026). It's open — no
 * certificates — until the trainer finishes it with everyone's practical
 * result. The code itself is shown from the session's page.
 */
export async function startSignInSessionAction(_prev: ClassroomState, formData: FormData): Promise<ClassroomState> {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  const title = String(formData.get("title") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim() || null;
  const trainer = String(formData.get("trainer") ?? "").trim();
  const duration = Number(formData.get("duration") ?? "") || null;
  const location = String(formData.get("location") ?? "").trim();
  if (!title) return { ok: false, error: "Say what the session is." };
  if (duration !== null && (duration < 1 || duration > 2880)) return { ok: false, error: "Give the length in minutes." };

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("classroom_sessions")
    .insert({
      organisation_id: context.organisationId,
      title,
      course_id: courseId,
      // Held the day it's started, in UK days.
      held_on: ukDay(new Date()),
      trainer_name: trainer || null,
      duration_minutes: duration,
      location: location || null,
      created_by: context.userId,
      finished_at: null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "classroom.sign_in_started", entity: "classroom_session", entityId: session.id as string, detail: { title } });
  redirect(`/org/classroom/${session.id}`);
}

/** An open session of this organisation's, or null. */
async function openSession(sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classroom_sessions")
    .select("id, organisation_id, title, course_id, held_on, trainer_name, finished_at")
    .eq("id", sessionId)
    .maybeSingle();
  return data && !data.finished_at ? data : null;
}

/**
 * A fresh QR code for signing in. Only its hash is kept, so each showing
 * makes a new one and the last stops working.
 */
export async function showSignInCodeAction(sessionId: string): Promise<SaveState & { link?: string }> {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  const session = await openSession(sessionId);
  if (!session) return { ok: false, error: "That session has finished." };
  const token = newSignInToken();
  const supabase = await createClient();
  const { error } = await supabase
    .from("classroom_sessions")
    .update({
      sign_in_token_hash: hashSignInToken(token),
      sign_in_expires_at: new Date(Date.now() + SIGN_IN_HOURS * 3600_000).toISOString(),
    })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, link: `${await siteOrigin()}${signInPath(token)}` };
}

/** Add someone who didn't scan in — no phone, or a flat battery. */
export async function addAttendeeAction(sessionId: string, userId: string): Promise<SaveState> {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  if (!(await openSession(sessionId))) return { ok: false, error: "That session has finished." };
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("organisation_id", context.organisationId!)
    .eq("status", "active")
    .maybeSingle();
  if (!person) return { ok: false, error: "They aren't current staff." };
  const { error } = await supabase
    .from("classroom_attendance")
    .upsert({ session_id: sessionId, organisation_id: context.organisationId, user_id: userId }, { onConflict: "session_id,user_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/classroom/${sessionId}`);
  return { ok: true };
}

/** Take someone off an open session — signed in by mistake. */
export async function removeAttendeeAction(sessionId: string, userId: string): Promise<SaveState> {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  if (!(await openSession(sessionId))) return { ok: false, error: "That session has finished." };
  const supabase = await createClient();
  const { error } = await supabase.from("classroom_attendance").delete().eq("session_id", sessionId).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/classroom/${sessionId}`);
  return { ok: true };
}

/**
 * Finish an open session: each person's practical result, then — for a
 * library course — the course completed with a certificate for each who
 * passed, as when a session is recorded after the fact. The QR code stops
 * working.
 */
export async function finishSessionAction(_prev: ClassroomState, formData: FormData): Promise<ClassroomState> {
  const context = await requireConsole();
  await requireFeature(context, "training.classroom");
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await openSession(sessionId);
  if (!session) return { ok: false, error: "That session has already finished." };

  const supabase = await createClient();
  const { data: attendance } = await supabase.from("classroom_attendance").select("user_id").eq("session_id", sessionId);
  const people = (attendance ?? []).map((a) => a.user_id as string);
  if (people.length === 0) return { ok: false, error: "Nobody has signed in yet." };
  const practical = new Map<string, boolean>();
  for (const id of people) {
    const r = String(formData.get(`practical:${id}`) ?? "");
    if (r !== "passed" && r !== "not_passed") return { ok: false, error: "Give each person's practical result." };
    practical.set(id, r === "passed");
  }
  for (const [userId, passed] of practical) {
    await supabase.from("classroom_attendance").update({ practical_passed: passed }).eq("session_id", sessionId).eq("user_id", userId);
  }
  const { error } = await supabase
    .from("classroom_sessions")
    .update({ finished_at: new Date().toISOString(), sign_in_token_hash: null, sign_in_expires_at: null })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };

  let certificates = 0;
  const passed = people.filter((id) => practical.get(id));
  if (session.course_id && passed.length > 0) {
    const admin = createAdminClient();
    const trainer = session.trainer_name as string | null;
    const heldOn = session.held_on as string;
    const note = `Completed in a classroom session on ${formatDate(heldOn, { day: "numeric", month: "long", year: "numeric" })}${trainer ? ` with ${trainer}` : ""}. Practical assessment passed.`;
    const issued = await completeInPerson({ admin, organisationId: context.organisationId!, userIds: passed, courseId: session.course_id as string, heldOn, note });
    for (const [userId, certificateId] of issued) {
      certificates++;
      await admin.from("classroom_attendance").update({ certificate_id: certificateId }).eq("session_id", sessionId).eq("user_id", userId);
    }
  }

  await logAudit({
    context,
    action: "classroom.recorded",
    entity: "classroom_session",
    entityId: sessionId,
    detail: { title: session.title, heldOn: session.held_on, attendees: people.length, passed: passed.length, courseId: session.course_id, certificates, signIn: true },
  });
  revalidatePath("/org/classroom");
  revalidatePath("/org");
  revalidatePath("/org/learners");
  for (const id of people) revalidatePath(`/org/staff/${id}`);
  // Back to the list, which says how it went: the open page has nothing left to show.
  redirect(`/org/classroom?finished=${certificates}`);
}
