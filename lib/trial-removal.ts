import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { formatDate } from "@/lib/dates";
import { siteOrigin } from "@/lib/site-url";
import { logAudit } from "@/lib/audit";
import { removeOrganisation } from "@/lib/org-removal";
import { trialRemovalStep, trialState } from "@/lib/trial";

const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

const longDate = { weekday: "long", day: "numeric", month: "long", year: "numeric" } as const;

/**
 * A free trial that ended without converting is removed 30 days later, with
 * everything it holds (TRIAL.md), as the trial-ended page told its managers.
 * We're warned a week before, with a link to convert or extend it instead.
 *
 * Held back, whatever the date: a company with a Stripe subscription (it's
 * paying, so the trial should have been converted). One removal per run, as
 * a removal can take minutes; any others go on the next day's run.
 */
export async function processTrialRemovals(
  admin: SupabaseClient,
  now: Date,
  dryRun: boolean,
): Promise<{ trialWarnings: number; trialsRemoved: number; trialsHeld: number }> {
  const { data: orgs, error } = await admin
    .from("organisations")
    .select("id, name, trial_ends_at, trial_email_sent, stripe_subscription_id")
    .not("trial_ends_at", "is", null);
  if (error) throw new Error(`Trials couldn't be read: ${error.message}`);

  const origin = await siteOrigin();
  let trialWarnings = 0;
  let trialsRemoved = 0;
  let trialsHeld = 0;

  for (const org of orgs ?? []) {
    const step = trialRemovalStep(org.trial_ends_at as string, (org.trial_email_sent as string | null) ?? null, now);
    if (!step) continue;
    const trial = trialState(org.trial_ends_at as string, now);
    if (trial.kind !== "ended") continue;
    const name = org.name as string;
    const page = `${origin}/platform/organisations/${org.id}?section=settings`;

    if (step.step === "warn") {
      trialWarnings += 1;
      if (dryRun) continue;
      await sendEmail({
        to: INBOX,
        subject: `Removed in a week: ${name}'s lapsed free trial`,
        html: emailLayout({
          heading: "A lapsed trial is removed in a week",
          body: `<p><strong>${esc(name)}</strong>'s free trial ended on ${esc(formatDate(trial.endsAt, longDate))}
            and it hasn't carried on. Everything it holds is removed on
            <strong>${esc(formatDate(trial.removeAt, longDate))}</strong>.</p>
            <p>If they're carrying on, convert it before then; to give them longer, extend it.</p>
            ${emailButton(page, "Open the organisation")}`,
          footer: "My Care Academy — the daily trials job.",
        }),
      });
      await admin.from("organisations").update({ trial_email_sent: step.key }).eq("id", org.id);
      continue;
    }

    if (org.stripe_subscription_id) {
      trialsHeld += 1;
      continue;
    }
    if (trialsRemoved >= 1) continue;
    trialsRemoved += 1;
    if (dryRun) continue;

    const summary = await removeOrganisation(admin, org.id as string);
    await logAudit({
      organisationId: null,
      action: "organisation.removed",
      entity: "organisation",
      entityId: org.id as string,
      detail: {
        name: summary.name,
        accounts: summary.accounts,
        files: summary.files,
        fileFailures: summary.fileFailures,
        reason: "free trial lapsed 30 days ago",
      },
    });
    await sendEmail({
      to: INBOX,
      subject: `Removed: ${name}'s lapsed free trial`,
      html: emailLayout({
        heading: "A lapsed trial was removed",
        body: `<p><strong>${esc(name)}</strong>'s free trial ended on ${esc(formatDate(trial.endsAt, longDate))}
          and it didn't carry on, so it has been removed with everything it held: ${summary.accounts}
          account${summary.accounts === 1 ? "" : "s"} and ${summary.files} file${summary.files === 1 ? "" : "s"}.</p>`,
        footer: "My Care Academy — the daily trials job.",
      }),
    });
  }
  return { trialWarnings, trialsRemoved, trialsHeld };
}
