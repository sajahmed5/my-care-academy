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
import {
  demoBookedNotificationEmail,
  demoRequestedEmail,
  demoSlotLabel,
  demoSlots,
  isOfferedDemoSlot,
  ukInstant,
  type DemoDay,
} from "@/lib/demo-booking";
import type { DemoBookingState, TrialSignupState } from "./signup";

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
      error: `That's a few sign-ups from here already. Call us on 0161 470 8088 or email ${INBOX} and we'll get you in.`,
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
  return {
    status: "sent",
    email: values.email,
    endsOn,
    emailed,
    booking: { orgId, orgName: values.orgName, name: values.name, phone: values.phone || null },
  };
}

/**
 * The demo slots open right now (lib/demo-booking.ts), less the ones
 * already booked. Read when the success screen's Book a demo is pressed, so
 * the list is fresh, not from whenever the page was built.
 */
export async function loadDemoSlotsAction(): Promise<DemoDay[]> {
  const now = new Date();
  const offered = demoSlots(now);
  if (offered.length === 0) return [];
  const { data } = await createAdminClient()
    .from("demo_bookings")
    .select("starts_at")
    .neq("status", "cancelled")
    .gte("starts_at", ukInstant(offered[0].day, 0).toISOString())
    .lte("starts_at", ukInstant(offered[offered.length - 1].day, 24 * 60).toISOString());
  return demoSlots(
    now,
    (data ?? []).map((r) => r.starts_at as string),
  );
}

/**
 * Book a demo for a company that has just signed up: the slot must be one
 * we offer today and still free, and the email must be the manager of the
 * company named, so nobody can book under another company from outside.
 * We're emailed to confirm it; they get a copy of the time.
 */
export async function bookDemoAction(_prev: DemoBookingState, form: FormData): Promise<DemoBookingState> {
  const orgId = (form.get("orgId") ?? "").toString().trim();
  const email = (form.get("email") ?? "").toString().trim().toLowerCase().slice(0, 200);
  const phone = (form.get("phone") ?? "").toString().trim().slice(0, 40) || null;
  const startsAt = (form.get("startsAt") ?? "").toString().trim();

  if (!startsAt) return { status: "error", error: "Pick a day and a time first." };
  if (!/^[0-9a-f-]{36}$/.test(orgId) || !email) {
    return { status: "error", error: "Something's missing. Sign up again, or give us a ring." };
  }
  if (!isOfferedDemoSlot(startsAt)) {
    return { status: "error", error: "That time isn't on offer any more. Pick another." };
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`demo-booking:${ip}`, 5, 60 * 60_000)) {
    return { status: "error", error: `That's a few bookings from here already. Ring us on 0161 470 8088 and we'll sort a time.` };
  }

  const admin = createAdminClient();
  const [{ data: manager }, { data: org }] = await Promise.all([
    admin.from("users").select("full_name").eq("organisation_id", orgId).eq("email", email).eq("role", "org_admin").limit(1).maybeSingle(),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  if (!manager || !org) {
    return { status: "error", error: "We couldn't match that to your sign-up. Give us a ring and we'll book it for you." };
  }
  const booking = {
    orgId,
    orgName: org.name as string,
    name: ((manager.full_name as string | null) ?? "").trim() || email,
    email,
    phone,
    startsAt: new Date(startsAt).toISOString(),
  };

  const { error } = await admin.from("demo_bookings").insert({
    organisation_id: orgId,
    org_name: booking.orgName,
    name: booking.name,
    email,
    phone,
    starts_at: booking.startsAt,
  });
  if (error) {
    // 23505: the slot's unique index — someone took it between the list and the press.
    if (error.code === "23505") return { status: "error", error: "That time has just been taken. Pick another." };
    console.error("demo booking: couldn't be saved:", error.message);
    return { status: "error", error: "Something went wrong at our end. Try again in a minute, or give us a ring." };
  }

  await logAudit({
    organisationId: orgId,
    action: "organisation.demo_booked",
    entity: "organisation",
    entityId: orgId,
    detail: { starts_at: booking.startsAt, email },
  });

  try {
    const origin = await siteOrigin();
    await Promise.all([
      sendEmail({ to: INBOX, ...demoBookedNotificationEmail(booking, origin), replyTo: email }),
      sendEmail({ to: email, ...demoRequestedEmail(booking), replyTo: INBOX }),
    ]);
  } catch (e) {
    // The booking stands; it's on the company's platform page either way.
    console.error("demo booking: emails failed:", e);
  }

  revalidatePath(`/platform/organisations/${orgId}`);
  return { status: "booked", when: demoSlotLabel(booking.startsAt) };
}
