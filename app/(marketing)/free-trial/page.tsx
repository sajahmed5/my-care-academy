import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarDays, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { TRIAL_DAYS, TRIAL_KEEP_DAYS } from "@/lib/trial";
import { DEMO_MINUTES } from "@/lib/demo-booking";
import { BreadcrumbLd } from "@/components/structured-data";
import { CheckItem, H2, Section } from "../ui";
import { TrialSignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: `Try My Care Academy free for ${TRIAL_DAYS} days | My Care Academy`,
  description: `Start a ${TRIAL_DAYS}-day free trial of My Care Academy for your care service: everything in Enterprise, unlimited carers, no card needed. Set up in two minutes.`,
  alternates: { canonical: "/free-trial" },
};

/**
 * Where "Try it free for 30 days" lands (TRIAL.md, 6 Nov 2026): a care
 * company signs itself up and is on the same 30-day Enterprise trial the
 * platform's invite form makes, with nobody at our end involved. Once
 * signed up they can book a 30-minute demo with us from the success screen
 * (lib/demo-booking.ts), which is where the header's Book a demo went.
 */
export default function FreeTrialPage() {
  return (
    <>
      <BreadcrumbLd trail={[{ name: "Free trial", path: "/free-trial" }]} />

      <section className="mca-hero -mt-24 px-4 pb-16 pt-36 text-white sm:pb-20 sm:pt-44">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white/95 ring-1 ring-white/25">
            <CreditCard className="size-4" /> No card, nothing to pay
          </div>
          <h1 className="font-display text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Try it free for {TRIAL_DAYS} days
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-white/85 sm:text-xl">
            Everything in Enterprise for your whole team, from today. Fill in the form, press the button in your
            welcome email, and you&apos;re in.
          </p>
        </div>
      </section>

      <Section className="-mt-10">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
          <div>
            <H2>Start your free trial</H2>
            <p className="mt-3 text-[#0f2f3c]/70">
              You&apos;ll be the company&apos;s manager. Add your office staff and carers once you&apos;re in.
            </p>
            <div className="mt-7">
              <TrialSignupForm />
            </div>
          </div>

          <div className="space-y-4 lg:pt-4">
            <div className="rounded-3xl bg-[#eef6fa] p-6 sm:p-7">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[#0f2f3c]">
                <Sparkles className="size-5 text-[#3a9fc4]" /> What you get
              </h3>
              <ul className="mt-4 space-y-3">
                <CheckItem title="Everything in Enterprise">
                  Every package&apos;s features, unlimited carers and admins, for {TRIAL_DAYS} days. Then pay per carer
                  for training alone, or pick a package.
                </CheckItem>
                <CheckItem title="Training, HR, audits and governance">
                  The full course library, the HR pack, supervisions and spot checks, complaints and safeguarding,
                  service audits, forms and policies.
                </CheckItem>
                <CheckItem title="Your own branding">
                  Your logo and colour on every page, email and certificate.
                </CheckItem>
              </ul>
            </div>

            <div className="rounded-3xl bg-[#fbf3ea] p-6 sm:p-7">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[#2b1d0e]">
                <CalendarClock className="size-5 text-[#9a6414]" /> After {TRIAL_DAYS} days
              </h3>
              <p className="mt-3 text-sm text-[#2b1d0e]/75">
                Your trial ends at the end of day {TRIAL_DAYS} and your company pauses. Everything you set up is kept
                for {TRIAL_KEEP_DAYS} days, so choose a package in that time and carry on where you left off. Nothing is
                charged unless you do.
              </p>
              <Link href="/training/pricing" className="mt-3 inline-block text-sm font-semibold text-[#9a6414] underline underline-offset-2">
                See the packages
              </Link>
            </div>

            <div className="rounded-3xl bg-white p-6 ring-1 ring-[#134f63]/10 sm:p-7">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[#0f2f3c]">
                <CalendarDays className="size-5 text-[#3a9fc4]" /> Want a walkthrough?
              </h3>
              <p className="mt-3 text-sm text-[#0f2f3c]/70">
                Once you&apos;ve signed up you can book a {DEMO_MINUTES}-minute demo on a day and time that suits you,
                and one of us will take you round it on a call.
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 ring-1 ring-[#134f63]/10 sm:p-7">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[#0f2f3c]">
                <ShieldCheck className="size-5 text-[#059669]" /> Held back during the trial
              </h3>
              <p className="mt-3 text-sm text-[#0f2f3c]/70">
                Booking face-to-face training, building bespoke reports and the AI assistant wait until you choose a
                package. You can see them all.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
