"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { sendEmailBatch } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { ABSENCE_REASONS } from "@/lib/hr/absence";
import { personName } from "@/lib/hr/server";
import { unitFor, validateLeave, type LeaveInput } from "@/lib/hr/holidays-server";
import { createCase, emailNewGrievance } from "@/lib/hr/cases-server";
import { saveExitAnswers } from "@/lib/hr/leavers-server";

/**
 * What a member of staff does from their own login (HR-PACK.md). Reporting
 * sick only when their company has switched it on; managers are emailed.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Every manager in the company, for an email that needs one of them. */
async function managerEmails(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<string[]> {
  const { data } = await admin.from("users").select("email").eq("organisation_id", orgId).eq("role", "org_admin").eq("status", "active").limit(50);
  return (data ?? []).map((u) => u.email as string).filter(Boolean);
}

export async function reportSickAction(input: { startDate: string; reason: string; note: string }): Promise<{ ok: boolean; error?: string }> {
  const context = await requireStaff();
  if (!(await hasFeature(context, "recruitment.tracker"))) return { ok: false, error: "Not available." };
  const admin = createAdminClient();
  const orgId = context.organisationId!;
  const { data: settings } = await admin.from("hr_settings").select("self_report_sickness").eq("organisation_id", orgId).maybeSingle();
  if (settings?.self_report_sickness !== true) return { ok: false, error: "Your company takes sickness by phone. Ring the office or the on-call line." };
  if (!ISO.test(input.startDate)) return { ok: false, error: "Choose your first day off." };
  const today = new Date().toISOString().slice(0, 10);
  if (input.startDate > today) return { ok: false, error: "You can report from today, not ahead." };
  if (!ABSENCE_REASONS.includes(input.reason)) return { ok: false, error: "Choose what's wrong." };
  const { data: open } = await admin.from("sickness_absences").select("id").eq("user_id", context.userId).is("returned_on", null).limit(1);
  if (open?.length) return { ok: false, error: "You're already off sick. The office records when you're back." };
  const { error } = await admin.from("sickness_absences").insert({
    organisation_id: orgId,
    user_id: context.userId,
    start_date: input.startDate,
    reason: input.reason,
    reason_detail: input.note.replace(/\r/g, "").trim().slice(0, 1000) || null,
    certification: "self",
    excluded_from_triggers: input.reason === "Pregnancy-related",
    exclusion_reason: input.reason === "Pregnancy-related" ? input.reason : null,
    reported_by_self: true,
    reported_by: context.userId,
  });
  if (error) return { ok: false, error: "That didn't send. Ring the office instead." };

  const [{ data: me }, to, origin] = await Promise.all([
    admin.from("users").select("full_name, email").eq("id", context.userId).maybeSingle(),
    managerEmails(admin, orgId),
    siteOrigin(),
  ]);
  const who = personName({ full_name: (me?.full_name as string | null) ?? null, email: (me?.email as string | null) ?? null });
  const html = emailLayout({
    heading: `${esc(who)} has reported sick`,
    body: `<p>From ${esc(formatDate(input.startDate, { weekday: "long", day: "numeric", month: "long" }))}: ${esc(input.reason)}.</p>
<p>Their visits may need covering. When they're back, record the date and hold their return-to-work interview within 3 days.</p>
${emailButton(`${origin}/org/hr/absence`, "Open Absence")}`,
  });
  if (to.length) {
    after(async () => {
      await sendEmailBatch(to.map((email) => ({ to: email, subject: `${who} has reported sick`, html, organisationId: orgId })));
    });
  }
  await logAudit({ context, action: "hr.absence_self_reported", entity: "user", entityId: context.userId, detail: { start: input.startDate, reason: input.reason } });
  revalidatePath("/learn/hr");
  return { ok: true };
}

/** Ask for leave from their own login: the office decides. */
export async function requestLeaveAction(input: LeaveInput): Promise<{ ok: boolean; error?: string }> {
  const context = await requireStaff();
  if (!(await hasFeature(context, "recruitment.tracker"))) return { ok: false, error: "Not available." };
  const admin = createAdminClient();
  const orgId = context.organisationId!;
  const { row, error } = await validateLeave(admin, orgId, input);
  if (!row) return { ok: false, error };
  if (input.start < new Date().toISOString().slice(0, 10)) return { ok: false, error: "Ask for leave from today on. For leave already taken, speak to the office." };
  const { error: insErr } = await admin.from("leave_requests").insert({
    ...row,
    organisation_id: orgId,
    user_id: context.userId,
    unit: await unitFor(admin, orgId, context.userId, input.start),
    status: "requested",
    requested_by: context.userId,
  });
  if (insErr) return { ok: false, error: "That didn't send. Try again." };
  await logAudit({ context, action: "hr.leave_requested", entity: "user", entityId: context.userId, detail: { ...row } });
  revalidatePath("/learn/hr");
  return { ok: true };
}

/** Take back a request that hasn't been decided. */
export async function cancelMyLeaveAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireStaff();
  const admin = createAdminClient();
  const { data: r } = await admin.from("leave_requests").select("user_id, status").eq("id", id).maybeSingle();
  if (!r || r.user_id !== context.userId) return { ok: false, error: "Not found." };
  if (r.status !== "requested") return { ok: false, error: "It has been decided: speak to the office to change it." };
  await admin.from("leave_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "requested");
  revalidatePath("/learn/hr");
  return { ok: true };
}

/**
 * Raise a grievance from their own login (HR-PACK.md). It goes to the
 * managers, never to a manager it's about; they acknowledge it in writing.
 */
export async function raiseGrievanceAction(input: { summary: string; aboutUserId: string }): Promise<{ ok: boolean; error?: string }> {
  const context = await requireStaff();
  if (!(await hasFeature(context, "recruitment.tracker"))) return { ok: false, error: "Not available." };
  const summary = input.summary.replace(/\r/g, "").trim().slice(0, 6000);
  if (summary.length < 20) return { ok: false, error: "Please explain your grievance in full: what happened, and what you'd like done about it." };
  const admin = createAdminClient();
  const orgId = context.organisationId!;
  let about: string | null = null;
  if (input.aboutUserId) {
    const { data: a } = await admin.from("users").select("id, organisation_id").eq("id", input.aboutUserId).maybeSingle();
    if (!a || a.organisation_id !== orgId || a.id === context.userId) return { ok: false, error: "Choose who it's about from the list, or leave it blank." };
    about = a.id as string;
  }
  const r = await createCase(admin, {
    orgId,
    kind: "grievance",
    subtype: "",
    userId: context.userId,
    aboutUserId: about,
    summary,
    raisedVia: "own_login",
    raisedBy: context.userId,
    linkedType: "",
    linkedId: "",
    linkedLabel: "",
    by: "them, from their own login",
  });
  if (!r.id) return { ok: false, error: "It didn't send. Please try again, or put it in writing to your manager." };
  await emailNewGrievance(admin, orgId, r.id, context.userId, about);
  await logAudit({ context, action: "hr.grievance_raised", entity: "hr_case", entityId: r.id });
  revalidatePath("/learn/hr");
  return { ok: true };
}

/** Their exit interview, from their own login while they still have it. */
export async function submitExitInterviewAction(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const context = await requireStaff();
  const admin = createAdminClient();
  const { data: l } = await admin.from("hr_leavers").select("id, exit_status").eq("user_id", context.userId).maybeSingle();
  if (!l || l.exit_status !== "asked") return { ok: false, error: "There's no exit interview waiting for you." };
  const r = await saveExitAnswers(admin, l.id as string, raw);
  if (r.ok) revalidatePath("/learn/hr");
  return r;
}
