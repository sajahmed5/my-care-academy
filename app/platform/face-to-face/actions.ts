"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ukDay, ukLocalToDate } from "@/lib/face-to-face";
import { emailBookings } from "@/lib/face-to-face-email";
import type { SaveState } from "@/app/platform/actions";

/**
 * Our side of face-to-face training (FACE-TO-FACE.md): sessions and closed
 * days. Signed-in users can only read these tables, so every write here is the
 * service role, after requireRole("platform_admin").
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface SessionFields {
  kind: "course" | "induction" | "refresher";
  course_id: string | null;
  starts_at: string;
  ends_at: string;
  trainer_name: string | null;
  places: number;
  notes: string | null;
}

/** Read and check the session form. A string is the error to show. */
function readSession(formData: FormData): SessionFields | string {
  const what = String(formData.get("what") ?? "");
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const trainer = String(formData.get("trainer") ?? "").trim();
  const places = Number(formData.get("places") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  // "induction", "refresher", or "course:<id>".
  const kind = what === "induction" || what === "refresher" ? what : what.startsWith("course:") ? "course" : null;
  const courseId = kind === "course" ? what.slice("course:".length) : null;
  if (!kind || (kind === "course" && !courseId)) return "Choose what the session is.";
  if (!DAY.test(date)) return "Choose the day.";
  const startsAt = ukLocalToDate(date, start);
  const endsAt = ukLocalToDate(date, end);
  if (!startsAt || !endsAt) return "Give a start and finish time.";
  if (endsAt <= startsAt) return "The finish time must be after the start.";
  if (!Number.isInteger(places) || places < 1 || places > 200) return "Give the number of places, from 1 to 200.";
  if (trainer.length > 200) return "The trainer's name is too long.";
  if (notes.length > 2000) return "The notes are too long.";
  return {
    kind,
    course_id: courseId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    trainer_name: trainer || null,
    places,
    notes: notes || null,
  };
}

/** The closed-day message, in words, when the session lands on one. */
async function closedDayClash(admin: ReturnType<typeof createAdminClient>, startsAt: string): Promise<string | null> {
  const { data } = await admin.from("face_to_face_closed_days").select("reason").eq("day", ukDay(startsAt)).maybeSingle();
  if (!data) return null;
  return `That day is marked closed${data.reason ? ` (${data.reason})` : ""}. Choose another day, or remove the closed day first.`;
}

export async function createSessionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const fields = readSession(formData);
  if (typeof fields === "string") return { ok: false, error: fields };
  if (new Date(fields.starts_at) <= new Date()) return { ok: false, error: "Set the session up for a time still to come." };

  const admin = createAdminClient();
  const clash = await closedDayClash(admin, fields.starts_at);
  if (clash) return { ok: false, error: clash };

  const { data, error } = await admin
    .from("face_to_face_sessions")
    .insert({ ...fields, created_by: context.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({ context, action: "face_to_face.session_created", entity: "face_to_face_session", entityId: data.id as string, detail: { ...fields } });
  revalidatePath("/platform/face-to-face");
  return { ok: true };
}

export async function updateSessionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const id = String(formData.get("id") ?? "");
  const fields = readSession(formData);
  if (typeof fields === "string") return { ok: false, error: fields };

  const admin = createAdminClient();
  const { data: before } = await admin.from("face_to_face_sessions").select("starts_at, ends_at, cancelled_at").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "That session no longer exists." };
  if (before.cancelled_at) return { ok: false, error: "That session was cancelled." };
  // The database writes times as +00:00, the form as Z: compare instants.
  const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  const moved = !same(fields.starts_at, before.starts_at as string) || !same(fields.ends_at, before.ends_at as string);
  if (!same(fields.starts_at, before.starts_at as string) && new Date(fields.starts_at) <= new Date()) {
    return { ok: false, error: "Move the session to a time still to come." };
  }
  const clash = await closedDayClash(admin, fields.starts_at);
  if (clash) return { ok: false, error: clash };
  const { count } = await admin
    .from("face_to_face_bookings")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id)
    .neq("status", "cancelled");
  if ((count ?? 0) > fields.places) {
    return { ok: false, error: `${count} people are booked, so it needs at least ${count} places.` };
  }

  const { error } = await admin.from("face_to_face_sessions").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Moved: everyone booked is told the new time, and reminded again for it.
  if (moved) {
    const { data: rebooked } = await admin
      .from("face_to_face_bookings")
      .update({ reminder_sent_at: null })
      .eq("session_id", id)
      .eq("status", "booked")
      .select("id");
    const ids = (rebooked ?? []).map((b) => b.id as string);
    if (ids.length > 0) after(() => emailBookings(admin, "changed", ids));
  }

  await logAudit({ context, action: "face_to_face.session_updated", entity: "face_to_face_session", entityId: id, detail: { ...fields } });
  revalidatePath("/platform/face-to-face");
  revalidatePath(`/platform/face-to-face/${id}`);
  return { ok: true };
}

/**
 * Take a session off the list. Kept as cancelled, so its history stays;
 * everyone booked on it loses the place and is told by email.
 */
export async function cancelSessionAction(id: string): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const admin = createAdminClient();
  const { error } = await admin
    .from("face_to_face_sessions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("cancelled_at", null);
  if (error) return { ok: false, error: error.message };
  const { data: dropped } = await admin
    .from("face_to_face_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: context.userId })
    .eq("session_id", id)
    .eq("status", "booked")
    .select("id");
  const ids = (dropped ?? []).map((b) => b.id as string);
  if (ids.length > 0) after(() => emailBookings(admin, "session_cancelled", ids));

  await logAudit({ context, action: "face_to_face.session_cancelled", entity: "face_to_face_session", entityId: id, detail: { bookingsCancelled: ids.length } });
  revalidatePath("/platform/face-to-face");
  revalidatePath(`/platform/face-to-face/${id}`);
  return { ok: true };
}

/**
 * Cancel one person's place from our side — when a company rings us inside
 * the 48 hours, say. They're emailed as for any cancelled place.
 */
export async function removeBookingAction(bookingId: string): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("face_to_face_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: context.userId })
    .eq("id", bookingId)
    .eq("status", "booked")
    .select("session_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That place isn't booked any more." };
  after(() => emailBookings(admin, "cancelled", [bookingId]));
  await logAudit({ context, action: "face_to_face.booking_cancelled", entity: "face_to_face_booking", entityId: bookingId });
  revalidatePath(`/platform/face-to-face/${data.session_id}`);
  revalidatePath("/platform/face-to-face");
  return { ok: true };
}

export async function addClosedDayAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const day = String(formData.get("day") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!DAY.test(day)) return { ok: false, error: "Choose the day." };
  if (reason.length > 200) return { ok: false, error: "Keep the reason short." };

  const admin = createAdminClient();
  // A session already on the day has to go first — closing round it would
  // leave people booked on a day nothing runs.
  const from = ukLocalToDate(day, "00:00")!;
  const to = new Date(from.getTime() + 36 * 3600_000);
  const { data: sessions } = await admin
    .from("face_to_face_sessions")
    .select("starts_at")
    .is("cancelled_at", null)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());
  const onDay = (sessions ?? []).filter((s) => ukDay(s.starts_at as string) === day).length;
  if (onDay > 0) {
    return { ok: false, error: `There ${onDay === 1 ? "is a session" : `are ${onDay} sessions`} that day. Cancel or move ${onDay === 1 ? "it" : "them"} first.` };
  }

  const { error } = await admin
    .from("face_to_face_closed_days")
    .upsert({ day, reason: reason || null, created_by: context.userId }, { onConflict: "day" });
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "face_to_face.closed_day_added", entity: "face_to_face_closed_day", detail: { day, reason } });
  revalidatePath("/platform/face-to-face");
  return { ok: true };
}

export async function removeClosedDayAction(day: string): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  if (!DAY.test(day)) return { ok: false, error: "That isn't a day." };
  const admin = createAdminClient();
  const { error } = await admin.from("face_to_face_closed_days").delete().eq("day", day);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "face_to_face.closed_day_removed", entity: "face_to_face_closed_day", detail: { day } });
  revalidatePath("/platform/face-to-face");
  return { ok: true };
}
