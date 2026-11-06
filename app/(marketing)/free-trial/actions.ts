"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/dates";
import { addCompanyPerson, emailsInUse } from "@/lib/company-people";
import { trialEndFrom, ukDateKey } from "@/lib/trial";
import { parseTrialSignup, trialSignupNotificationEmail } from "@/lib/trial-signup";
import type { TrialSignupState } from "./signup";

/** Where we hear about each sign-up. Overridable so a preview can divert it. */
const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";

const longDate = { weekday: "long", day: "numeric", month: "long" } as const;

/**
 * A care company starts its own 30-day free trial from the website
 * (TRIAL.md): the company is made on Enterprise with today as day one, the
 * person who signed up is its manager, and they get the trial welcome email
 * with the set-up button — the same company and the same email the platform's
 * invite form makes, with nobody at our end involved. We're emailed so we
 * can say hello.
 *
 * Public by design, so the protections are the contact form's: a honeypot,
 * a per-IP throttle, and length caps. Nothing works until the welcome email's
 * button is pressed, so an address that isn't theirs gets them nowhere. One
 * trial per email address, and no second company under a name already here.
 */
export async function startTrialAction(_prev: TrialSignupState, form: FormData): Promise<TrialSignupState> {
  const todayKey = ukDateKey(new Date());
  const endsAt = trialEndFrom(todayKey);
  const endsOn = formatDate(endsAt, longDate);

  // Honeypot: a field no sighted visitor sees. Bots get the success screen
  // rather than a hint about what gave them away.
  if ((form.get("website") ?? "").toString().trim()) {
    return { status: "sent", email: (form.get("email") ?? "").toString().trim().slice(0, 200), endsOn, emailed: true };
  }

  const { values, fieldErrors } = parseTrialSignup(form);
  if (Object.keys(fieldErrors).length > 0) return { status: "error", fieldErrors, values };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`trial-signup:${ip}`, 3, 60 * 60_000)) {
    return {
      status: "error",
      error: `That's a few sign-ups from here already. Call us on 0161 694 4701 or email ${INBOX} and we'll get you in.`,
      values,
    };
  }

  const admin = createAdminClient();
  const [taken, { data: sameName }] = await Promise.all([
    emailsInUse(admin, [values.email]),
    admin.from("organisations").select("id").ilike("name", values.orgName).limit(1).maybeSingle(),
  ]);
  if (taken.length > 0) {
    return {
      status: "error",
      fieldErrors: { email: "That email already has an account. Sign in instead, or use another address." },
      values,
    };
  }
  if (sameName) {
    return {
      status: "error",
      error: `A company called ${values.orgName} is already with us. If that's you, sign in, or get in touch and we'll sort it out.`,
      values,
    };
  }

  const { data: org, error } = await admin
    .from("organisations")
    .insert({
      name: values.orgName,
      package_tier: "full",
      trial_ends_at: endsAt.toISOString(),
      service_type: values.serviceType,
      size_band: values.sizeBand,
    })
    .select("id")
    .single();
  if (error || !org) {
    console.error("trial sign-up: company couldn't be made:", error?.message);
    return { status: "error", error: "Something went wrong at our end. Try again in a minute, or give us a ring.", values };
  }
  const orgId = org.id as string;

  const outcome = await addCompanyPerson(
    admin,
    { name: values.name, email: values.email, role: "org_admin", access: "email" },
    { orgId, orgName: values.orgName, trial: { startsKey: todayKey, endsAt }, others: [], sentBy: null },
  );
  if (!outcome.ok) {
    // Undo the company rather than leave an empty one on a trial.
    await admin.from("organisations").delete().eq("id", orgId);
    return { status: "error", error: outcome.error ?? "Your account couldn't be made. Try again, or give us a ring.", values };
  }
  const emailed = outcome.emailed === true;

  await logAudit({
    organisationId: orgId,
    action: "organisation.signed_up",
    entity: "organisation",
    entityId: orgId,
    detail: {
      package_tier: "full",
      trial_starts: todayKey,
      trial_ends_at: endsAt.toISOString(),
      service_type: values.serviceType,
      size_band: values.sizeBand,
      manager: { email: values.email, emailed },
    },
  });

  try {
    const mail = trialSignupNotificationEmail(
      {
        orgId,
        orgName: values.orgName,
        name: values.name,
        email: values.email,
        phone: values.phone || null,
        serviceType: values.serviceType,
        sizeBand: values.sizeBand,
        endsOn,
        emailed,
      },
      await siteOrigin(),
    );
    await sendEmail({ to: INBOX, ...mail, replyTo: values.email });
  } catch (e) {
    // They're in regardless; the company is on the platform's list either way.
    console.error("trial sign-up: notification failed:", e);
  }

  revalidatePath("/platform");
  revalidatePath("/platform/organisations");
  return { status: "sent", email: values.email, endsOn, emailed };
}
