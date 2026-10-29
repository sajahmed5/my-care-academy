"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { canCancelBooking } from "@/lib/face-to-face";
import { emailBookings } from "@/lib/face-to-face-email";
import type { SaveState } from "@/app/platform/actions";

export interface BookState extends SaveState {
  booked?: number;
}

/**
 * Book named staff onto one of our sessions (FACE-TO-FACE.md). The company's
 * console users read bookings under RLS but don't write them: the checks are
 * here, the write is the service role, and the table's trigger holds the
 * line on places if two managers book the last one at once.
 */
export async function bookStaffAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const context = await requireConsole();
  await requireFeature(context, "training.face_to_face");
  const orgId = context.organisationId!;
  const sessionId = String(formData.get("sessionId") ?? "");
  const picked = [...new Set(formData.getAll("person").map(String).filter(Boolean))];
  if (picked.length === 0) return { ok: false, error: "Tick who's going." };

  const admin = createAdminClient();
  const [{ data: session }, { data: staff }, { data: taken }] = await Promise.all([
    admin.from("face_to_face_sessions").select("id, starts_at, places, cancelled_at").eq("id", sessionId).maybeSingle(),
    // A ticked box is not a permission check: only this company's current staff.
    admin.from("users").select("id").eq("organisation_id", orgId).eq("status", "active").in("id", picked.slice(0, 200)),
    admin.from("face_to_face_bookings").select("user_id").eq("session_id", sessionId).neq("status", "cancelled"),
  ]);
  if (!session || session.cancelled_at) return { ok: false, error: "That session isn't running any more." };
  if (new Date(session.starts_at as string) <= new Date()) return { ok: false, error: "That session has already started." };

  const already = new Set((taken ?? []).map((t) => t.user_id as string));
  const people = (staff ?? []).map((u) => u.id as string).filter((id) => !already.has(id));
  if (people.length === 0) return { ok: false, error: "They're already booked on it." };
  const left = (session.places as number) - already.size;
  if (people.length > left) {
    return { ok: false, error: left === 0 ? "That session is full." : `Only ${left} place${left === 1 ? "" : "s"} left. Untick ${people.length - left}.` };
  }

  const { data: rows, error } = await admin
    .from("face_to_face_bookings")
    .insert(people.map((user_id) => ({ session_id: sessionId, organisation_id: orgId, user_id, booked_by: context.userId })))
    .select("id");
  if (error) {
    // The trigger's own words: full, started, cancelled — someone got there first.
    return { ok: false, error: error.code === "23505" ? "Someone ticked is already booked on it." : error.message };
  }
  const ids = (rows ?? []).map((r) => r.id as string);

  after(() => emailBookings(admin, "booked", ids));
  await logAudit({ context, action: "face_to_face.booked", entity: "face_to_face_session", entityId: sessionId, detail: { people: people.length } });
  revalidatePath("/org/face-to-face");
  return { ok: true, booked: ids.length };
}

/** Cancel a place, up to 48 hours before. After that, a place not used is a no-show. */
export async function cancelBookingAction(bookingId: string): Promise<SaveState> {
  const context = await requireConsole();
  await requireFeature(context, "training.face_to_face");
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("face_to_face_bookings")
    .select("id, organisation_id, status, session:face_to_face_sessions (starts_at)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || b.organisation_id !== context.organisationId) return { ok: false, error: "That booking isn't yours to cancel." };
  if (b.status !== "booked") return { ok: false, error: "That place can't be cancelled now." };
  const session = (Array.isArray(b.session) ? b.session[0] : b.session) as { starts_at: string } | null;
  if (!session || !canCancelBooking(session.starts_at)) {
    return { ok: false, error: "It's less than 48 hours to go, so the place can't be cancelled. If they can't come, it's recorded as a no-show." };
  }

  const { error } = await admin
    .from("face_to_face_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: context.userId })
    .eq("id", bookingId)
    .eq("status", "booked");
  if (error) return { ok: false, error: error.message };

  after(() => emailBookings(admin, "cancelled", [bookingId]));
  await logAudit({ context, action: "face_to_face.booking_cancelled", entity: "face_to_face_booking", entityId: bookingId });
  revalidatePath("/org/face-to-face");
  return { ok: true };
}
