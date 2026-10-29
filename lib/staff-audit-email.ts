/**
 * Telling someone their supervision or appraisal is booked (STAFF-AUDITS.md):
 * the date, the time, who with and where. Spot checks are never booked, so
 * never announced.
 *
 * Unlike a task email, it goes to someone who has not signed in yet: the date
 * is the point, and it is no less true for a login they have not used. Run
 * inside after(), so a slow mail provider never holds up the booking, and a
 * failed send never undoes it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { emailButton, emailLayout, esc } from "./email-layout";
import { formatDate } from "./dates";

export interface BookingNotice {
  kind: "supervision" | "appraisal";
  bookedOn: string;
  bookedTime: string | null;
  withName: string;
  location: string | null;
  note: string | null;
  /** True when there is a self-assessment waiting for them. */
  selfAssessment: boolean;
}

/** Subject and body. Pure, so it is tested. */
export function bookingEmail(
  notice: BookingNotice,
  ctx: { name: string | null; orgName: string; origin: string },
): { subject: string; html: string } {
  const what = notice.kind === "appraisal" ? "appraisal" : "supervision";
  const date = formatDate(notice.bookedOn, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const when = notice.bookedTime ? `${date} at ${notice.bookedTime}` : date;
  const subject = `Your ${what} is booked: ${formatDate(notice.bookedOn, { day: "numeric", month: "short" })}`;
  const lines = [
    `<p style="font-size:17px"><strong>${esc(when)}</strong></p>`,
    `<p>With ${esc(notice.withName)}${notice.location ? `, ${esc(notice.location)}` : ""}.</p>`,
    notice.note ? `<p style="color:#444">${esc(notice.note)}</p>` : "",
    notice.selfAssessment
      ? `<p>Before it, please fill in a short self-assessment on My Care Academy — four questions about your year. Only your manager sees it.</p>${emailButton(`${ctx.origin}/learn/reviews`, "Fill it in")}`
      : `<p>If the time does not work, speak to ${esc(notice.withName)}.</p>`,
  ];
  const html = emailLayout({
    body: `<p>Hi ${esc(ctx.name ?? "there")},</p>
<p>${esc(ctx.orgName)} has booked your ${what}:</p>
${lines.join("\n")}`,
    footer: `My Care Academy — sent for ${esc(ctx.orgName)}.`,
  });
  return { subject, html };
}

/** Email the person and log it. Never throws. */
export async function emailBooking(
  admin: SupabaseClient,
  notice: BookingNotice & { userId: string },
  ctx: { organisationId: string; bookedBy: string; origin: string },
): Promise<boolean> {
  try {
    const [{ data: person }, { data: org }] = await Promise.all([
      admin
        .from("users")
        .select("id, full_name, email, status")
        .eq("id", notice.userId)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle(),
      admin.from("organisations").select("name").eq("id", ctx.organisationId).maybeSingle(),
    ]);
    // Booking your own (an office worker's supervision held by themselves is
    // not a thing, but a slip of the picker is) needs no email.
    if (!person?.email || person.status !== "active" || person.id === ctx.bookedBy) return false;
    const { subject, html } = bookingEmail(notice, {
      name: (person.full_name as string | null) ?? null,
      orgName: (org?.name as string | null) ?? "your organisation",
      origin: ctx.origin,
    });
    const sent = await sendEmail({ to: person.email as string, subject, html });
    await admin.from("email_log").insert({
      organisation_id: ctx.organisationId,
      to_email: person.email,
      type: `${notice.kind}_booked`,
      subject,
      sent,
    });
    return sent;
  } catch (err) {
    console.error("Booking email failed:", err);
    return false;
  }
}
