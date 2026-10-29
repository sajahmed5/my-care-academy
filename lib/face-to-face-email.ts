/**
 * The emails about a face-to-face booking (FACE-TO-FACE.md, 29 Oct 2026).
 *
 * Each person booked gets a confirmation, and a reminder the day before from
 * the morning job. A cancelled place, or a session we cancel, is said too.
 * Every send is logged in email_log like the rest.
 *
 * Unlike a task email, these go to someone who has never signed in: there is
 * no link to follow, and they need to know where to be.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailBatch } from "./email";
import { emailLayout, esc } from "./email-layout";
import { nextUkDay, sessionTitle, sessionWhen, ukDay, ukTime } from "./face-to-face";

export type BookingEmailKind = "booked" | "changed" | "reminder" | "cancelled" | "session_cancelled";

export interface BookingEmailSession {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  trainer: string | null;
  notes: string | null;
}

/** The subject and body for one person's email. Pure, so it can be tested. */
export function bookingEmail(
  kind: BookingEmailKind,
  session: BookingEmailSession,
  ctx: { name: string | null; orgName: string; bookedByName: string },
): { subject: string; html: string } {
  const details = `<p style="font-size:17px;margin-bottom:4px"><strong>${esc(session.title)}</strong></p>
<p style="margin-top:0">${esc(sessionWhen(session.startsAt, session.endsAt))}<br>${esc(session.location)}${
    session.trainer ? `<br>Trainer: ${esc(session.trainer)}` : ""
  }</p>`;
  const notes = session.notes ? `<p style="color:#444">${esc(session.notes)}</p>` : "";
  const hi = `<p>Hi ${esc(ctx.name ?? "there")},</p>`;
  const org = esc(ctx.orgName);

  if (kind === "booked") {
    return {
      subject: `Booked: ${session.title}, ${sessionWhen(session.startsAt, session.endsAt)}`,
      html: emailLayout({
        heading: "You're booked on face-to-face training",
        body: `${hi}<p>${esc(ctx.bookedByName)} at ${org} has booked you onto a training session at our office in Stockport:</p>
${details}${notes}
<p>We'll send a reminder the day before. If you can't come, tell ${org} at least 48 hours before, so the place can be cancelled.</p>`,
        footer: `My Care Academy — sent for ${org}.`,
      }),
    };
  }
  if (kind === "changed") {
    return {
      subject: `Changed: ${session.title}, now ${sessionWhen(session.startsAt, session.endsAt)}`,
      html: emailLayout({
        heading: "Your training session has moved",
        body: `${hi}<p>The time of your face-to-face training session has changed. It's now:</p>
${details}${notes}
<p>If you can't make the new time, tell ${org} as soon as you can.</p>`,
        footer: `My Care Academy — sent for ${org}.`,
      }),
    };
  }
  if (kind === "reminder") {
    return {
      subject: `Tomorrow: ${session.title} at ${ukTime(session.startsAt)}, Stockport`,
      html: emailLayout({
        heading: "Your training is tomorrow",
        body: `${hi}<p>A reminder that ${org} has booked you onto face-to-face training tomorrow:</p>
${details}${notes}
<p>Please arrive a few minutes early. If you can't come, tell ${org} as soon as you can.</p>`,
        footer: `My Care Academy — sent for ${org}.`,
      }),
    };
  }
  if (kind === "cancelled") {
    return {
      subject: `Cancelled: ${session.title}, ${sessionWhen(session.startsAt, session.endsAt)}`,
      html: emailLayout({
        heading: "Your training place has been cancelled",
        body: `${hi}<p>${org} has cancelled your place on this session, so you don't need to go:</p>${details}
<p>Speak to ${org} if you weren't expecting this.</p>`,
        footer: `My Care Academy — sent for ${org}.`,
      }),
    };
  }
  return {
    subject: `Session cancelled: ${session.title}, ${sessionWhen(session.startsAt, session.endsAt)}`,
    html: emailLayout({
      heading: "We've had to cancel a training session",
      body: `${hi}<p>We're sorry: this session has been cancelled, so please don't go to it.</p>${details}
<p>${org} can book you onto another date.</p>`,
      footer: `My Care Academy — sent for ${org}.`,
    }),
  };
}

interface BookingRow {
  id: string;
  organisation_id: string;
  person: unknown;
  booker: unknown;
  org: unknown;
  session: unknown;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const BOOKING_SELECT =
  "id, organisation_id, person:users!face_to_face_bookings_user_id_fkey (full_name, email, status), booker:users!face_to_face_bookings_booked_by_fkey (full_name, email), org:organisations (name), session:face_to_face_sessions (kind, starts_at, ends_at, location, trainer_name, notes, course:courses (title))";

/**
 * Email each booking's person and log it; stamp the confirmation or reminder
 * so it is never sent twice. Returns how many went. Never throws: a booking
 * stands whether or not the mail did.
 */
export async function emailBookings(
  admin: SupabaseClient,
  kind: BookingEmailKind,
  bookingIds: string[],
): Promise<number> {
  try {
    if (bookingIds.length === 0) return 0;
    const rows: BookingRow[] = [];
    for (let i = 0; i < bookingIds.length; i += 100) {
      const { data } = await admin
        .from("face_to_face_bookings")
        .select(BOOKING_SELECT)
        .in("id", bookingIds.slice(i, i + 100));
      rows.push(...((data ?? []) as BookingRow[]));
    }

    const outgoing = rows.flatMap((b) => {
      const person = one(b.person as { full_name: string | null; email: string | null; status: string } | null);
      const s = one(
        b.session as {
          kind: string;
          starts_at: string;
          ends_at: string;
          location: string;
          trainer_name: string | null;
          notes: string | null;
          course: unknown;
        } | null,
      );
      if (!person?.email || person.status !== "active" || !s) return [];
      const booker = one(b.booker as { full_name: string | null; email: string | null } | null);
      const { subject, html } = bookingEmail(
        kind,
        {
          title: sessionTitle(s.kind, one(s.course as { title: string } | null)?.title),
          startsAt: s.starts_at,
          endsAt: s.ends_at,
          location: s.location,
          trainer: s.trainer_name,
          notes: s.notes,
        },
        {
          name: person.full_name,
          orgName: one(b.org as { name: string } | null)?.name ?? "your company",
          bookedByName: booker?.full_name || booker?.email || "Your manager",
        },
      );
      return [{ id: b.id, organisationId: b.organisation_id, to: person.email, subject, html }];
    });
    if (outgoing.length === 0) return 0;

    const sent = await sendEmailBatch(outgoing.map(({ to, subject, html }) => ({ to, subject, html })));
    await admin.from("email_log").insert(
      outgoing.map((m, i) => ({
        organisation_id: m.organisationId,
        to_email: m.to,
        type: `face_to_face_${kind}`,
        subject: m.subject,
        sent: sent[i],
      })),
    );
    const stamp = kind === "booked" ? "confirmation_sent_at" : kind === "reminder" ? "reminder_sent_at" : null;
    const done = outgoing.filter((_, i) => sent[i]).map((m) => m.id);
    if (stamp && done.length > 0) {
      await admin.from("face_to_face_bookings").update({ [stamp]: new Date().toISOString() }).in("id", done);
    }
    return done.length;
  } catch (err) {
    console.error("Face-to-face email failed:", err);
    return 0;
  }
}

/**
 * The morning job's part: a reminder to everyone booked on a session
 * tomorrow, in UK days, who hasn't had one. The job runs at 7am UTC, so
 * "tomorrow" is the London calendar's, whatever the season.
 */
export async function processFaceToFaceReminders(
  admin: SupabaseClient,
  now: Date,
  dryRun: boolean,
): Promise<{ faceToFaceReminders: number }> {
  const tomorrow = nextUkDay(ukDay(now));
  // A window wide enough for either side of the clocks changing; the exact
  // day is checked below in UK time.
  const from = new Date(now.getTime() + 6 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 54 * 3600_000).toISOString();
  const { data: sessions } = await admin
    .from("face_to_face_sessions")
    .select("id, starts_at")
    .is("cancelled_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to);
  const ids = (sessions ?? []).filter((s) => ukDay(s.starts_at as string) === tomorrow).map((s) => s.id as string);
  if (ids.length === 0) return { faceToFaceReminders: 0 };

  const { data: due } = await admin
    .from("face_to_face_bookings")
    .select("id")
    .in("session_id", ids)
    .eq("status", "booked")
    .is("reminder_sent_at", null);
  const bookingIds = (due ?? []).map((b) => b.id as string);
  if (dryRun) return { faceToFaceReminders: bookingIds.length };
  return { faceToFaceReminders: await emailBookings(admin, "reminder", bookingIds) };
}
