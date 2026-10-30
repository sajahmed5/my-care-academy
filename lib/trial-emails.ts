import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { formatDate } from "@/lib/dates";
import { siteOrigin } from "@/lib/site-url";
import { TRIAL_KEEP_DAYS, trialEmailDue, trialState } from "@/lib/trial";

type Admin = ReturnType<typeof createAdminClient>;

const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

const longDate = { weekday: "long", day: "numeric", month: "long" } as const;

/**
 * The free trial's emails, from the daily job (TRIAL.md): a company's
 * managers at two days left and on the last day, and us on the last day so
 * we can follow up. Each is sent once per end date (trialEmailDue).
 */
export async function processTrialEmails(admin: Admin, now: Date, dryRun: boolean): Promise<{ trialEmails: number }> {
  const { data: orgs, error } = await admin
    .from("organisations")
    .select("id, name, status, trial_ends_at, trial_email_sent")
    .not("trial_ends_at", "is", null)
    .neq("status", "suspended");
  if (error) throw new Error(`Trials couldn't be read: ${error.message}`);

  let sent = 0;
  const origin = await siteOrigin();
  for (const org of orgs ?? []) {
    const due = trialEmailDue(org.trial_ends_at as string, (org.trial_email_sent as string | null) ?? null, now);
    if (!due) continue;
    const trial = trialState(org.trial_ends_at as string, now);
    if (trial.kind !== "active") continue;

    const { data: managers } = await admin
      .from("users")
      .select("email, full_name")
      .eq("organisation_id", org.id)
      .eq("role", "org_admin")
      .eq("status", "active");
    const name = org.name as string;
    const ends = formatDate(trial.endsAt, longDate);
    const kept = formatDate(new Date(trial.endsAt.getTime() + TRIAL_KEEP_DAYS * 86_400_000), longDate);
    const account = `${origin}/org/billing#change`;

    const mail =
      due.kind === "two_days"
        ? {
            subject: "Your free trial ends in 2 days",
            html: emailLayout({
              heading: "Your free trial ends in 2 days",
              body: `<p>${esc(name)}'s free trial of My Care Academy ends at the end of <strong>${esc(ends)}</strong>.</p>
                <p>To carry on where you left off, choose a package on your Account page. Everything you've set up stays.</p>
                ${emailButton(account, "Choose a package")}`,
              footer: "My Care Academy — sent to your company's managers during its free trial.",
            }),
          }
        : {
            subject: "Your free trial ends tonight",
            html: emailLayout({
              heading: "Your free trial ends tonight",
              body: `<p>${esc(name)}'s free trial of My Care Academy ends at midnight tonight.</p>
                <p>After that, your staff can't sign in until you choose a package. Everything you've set up is kept
                until ${esc(kept)}, so you can carry on where you left off.</p>
                ${emailButton(account, "Choose a package")}`,
              footer: "My Care Academy — sent to your company's managers during its free trial.",
            }),
          };

    if (!dryRun) {
      for (const m of managers ?? []) {
        if (await sendEmail({ to: m.email as string, ...mail })) sent += 1;
      }
      if (due.kind === "last_day") {
        const who = (managers ?? [])
          .map((m) => `${esc((m.full_name as string | null) || (m.email as string))} (${esc(m.email as string)})`)
          .join(", ");
        if (
          await sendEmail({
            to: INBOX,
            subject: `Free trial ends tonight: ${name}`,
            html: emailLayout({
              heading: "A free trial ends tonight",
              body: `<p><strong>${esc(name)}</strong>'s free trial ends at midnight tonight.</p>
                <p>Managers: ${who || "none active"}.</p>
                <p>Convert or extend it on the organisation's page, under Settings, Free trial.</p>
                ${emailButton(`${origin}/platform/organisations/${org.id}?section=settings`, "Open the organisation")}`,
              footer: "My Care Academy — the daily job.",
            }),
          })
        )
          sent += 1;
      }
      await admin.from("organisations").update({ trial_email_sent: due.key }).eq("id", org.id);
    } else {
      sent += (managers ?? []).length + (due.kind === "last_day" ? 1 : 0);
    }
  }
  return { trialEmails: sent };
}
