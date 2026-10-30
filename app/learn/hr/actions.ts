"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { ABSENCE_REASONS } from "@/lib/hr/absence";
import { personName } from "@/lib/hr/server";

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
  after(async () => {
    for (const email of to) {
      await sendEmail({
        to: email,
        subject: `${who} has reported sick`,
        html: emailLayout({
          heading: `${esc(who)} has reported sick`,
          body: `<p>From ${esc(formatDate(input.startDate, { weekday: "long", day: "numeric", month: "long" }))}: ${esc(input.reason)}.</p>
<p>Their visits may need covering. When they're back, record the date and hold their return-to-work interview within 3 days.</p>
${emailButton(`${origin}/org/hr/absence`, "Open Absence")}`,
        }),
      });
    }
  });
  await logAudit({ context, action: "hr.absence_self_reported", entity: "user", entityId: context.userId, detail: { start: input.startDate, reason: input.reason } });
  revalidatePath("/learn/hr");
  return { ok: true };
}
