import "server-only";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { amountText, holidaySettingsFromRow, leaveTypeLabel, leaveTypesFor, leaveYear, sanitiseLeaveTypes } from "@/lib/hr/holidays";
import { firstName, type Admin, type Person } from "@/lib/hr/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function holidaySettings(admin: Admin, orgId: string) {
  const { data } = await admin.from("hr_settings").select("leave_year_start, bank_holidays_from_allowance, max_off_at_once, leave_types").eq("organisation_id", orgId).maybeSingle();
  return holidaySettingsFromRow(data);
}

export interface LeaveInput {
  type: string;
  start: string;
  end: string;
  amount: number;
  note: string;
}

/** Shared by the console and the person's own page. */
export async function validateLeave(admin: Admin, orgId: string, input: LeaveInput): Promise<{ row?: Record<string, unknown>; error?: string }> {
  const s = await holidaySettings(admin, orgId);
  if (!leaveTypesFor(s.own).some((t) => t.key === input.type)) return { error: "Choose the kind of leave." };
  if (!ISO.test(input.start) || !ISO.test(input.end)) return { error: "Choose the dates." };
  if (input.end < input.start) return { error: "The last day is before the first." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 2000) return { error: "Enter how much it takes, as a number." };
  return { row: { leave_type: input.type, start_date: input.start, end_date: input.end, amount, note: input.note.replace(/\r/g, "").trim().slice(0, 500) || null } };
}

/** The unit the person's allowance is in for that leave year, or days. */
export async function unitFor(admin: Admin, orgId: string, userId: string, start: string): Promise<string> {
  const s = await holidaySettings(admin, orgId);
  const { data } = await admin.from("leave_allowances").select("unit").eq("user_id", userId).eq("year_start", leaveYear(start, s.yearStart).start).maybeSingle();
  return (data?.unit as string | undefined) ?? "days";
}


const day = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** Tell the person what was decided about their leave. Never throws. */
export async function emailLeaveDecision(
  admin: Admin,
  person: Person,
  r: { leave_type: string; start_date: string; end_date: string; amount: number; unit: string; status: string; decision_note: string | null },
  orgId: string,
): Promise<void> {
  if (!person.email) return;
  try {
    const [{ data: org }, { data: settings }, origin] = await Promise.all([
      admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
      admin.from("hr_settings").select("leave_types").eq("organisation_id", orgId).maybeSingle(),
      siteOrigin(),
    ]);
    const orgName = (org?.name as string | undefined) ?? "Your employer";
    const what = leaveTypeLabel(r.leave_type, sanitiseLeaveTypes(settings?.leave_types)).toLowerCase();
    const when = r.start_date === r.end_date ? day(r.start_date) : `${day(r.start_date)} to ${day(r.end_date)}`;
    const ok = r.status === "approved";
    await sendEmail({
      to: person.email,
      organisationId: orgId,
      subject: ok ? `Your ${what} is approved` : `Your ${what} request`,
      html: emailLayout({
        body: `<p>Hi ${esc(firstName(person))},</p>
<p>${ok ? "Your request has been approved" : "Sorry, your request has been declined"}: <strong>${esc(when)}</strong> (${esc(amountText(r.amount, r.unit))}).</p>
${r.decision_note ? `<p>${esc(r.decision_note)}</p>` : ""}
${emailButton(`${origin}/learn/hr`, "See your holidays")}`,
        footer: `My Care Academy — sent for ${esc(orgName)}.`,
      }),
    });
  } catch (err) {
    console.error("leave decision email failed:", err);
  }
}
