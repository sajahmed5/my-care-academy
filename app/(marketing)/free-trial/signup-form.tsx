"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Loader2, MailCheck, Phone } from "lucide-react";
import { SERVICE_TYPES, SIZE_BANDS } from "@/lib/organisations";
import type { TrialSignupValues } from "@/lib/trial-signup";
import { startTrialAction } from "./actions";
import { DemoBookingForm } from "./demo-booking-form";
import { INITIAL_TRIAL_SIGNUP_STATE } from "./signup";

const field =
  "w-full rounded-xl border border-[#134f63]/15 bg-white px-4 py-3 text-sm text-[#0f2f3c] outline-none transition placeholder:text-[#0f2f3c]/35 focus:border-[#3a9fc4] focus:ring-4 focus:ring-[#3a9fc4]/15";
const select = `${field} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%230f2f3c" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>')] bg-[length:18px] bg-[right_1rem_center] bg-no-repeat pr-11`;
const labelClass = "block text-sm font-semibold text-[#0f2f3c]";
const hintClass = "text-xs font-normal text-[#0f2f3c]/70";

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-[#b42318]">
      {children}
    </p>
  );
}

/**
 * The free-trial sign-up: the company, the person who'll manage it, and
 * what kind of service it is. On success they're told to look in their
 * inbox for the welcome email, whose button sets their password, and
 * offered a demo (Saj, 6 Nov 2026): Book a demo opens the chooser in place.
 */
export function TrialSignupForm() {
  const [state, formAction, pending] = useActionState(startTrialAction, INITIAL_TRIAL_SIGNUP_STATE);
  const panelRef = useRef<HTMLDivElement>(null);
  const [booking, setBooking] = useState(false);

  // Move focus to the outcome so it is announced rather than silently
  // swapped in below the fold.
  useEffect(() => {
    if (state.status !== "idle") panelRef.current?.focus();
  }, [state.status]);

  if (state.status === "sent") {
    return (
      <div
        ref={panelRef}
        tabIndex={-1}
        className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#134f63]/10 outline-none sm:p-10"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#059669]/12 text-[#059669]">
          {state.emailed ? <MailCheck className="size-6" /> : <CheckCircle2 className="size-6" />}
        </span>
        <h2 className="font-display mt-5 text-2xl font-semibold text-[#0f2f3c]">
          {state.emailed ? "Check your inbox" : "You're signed up"}
        </h2>
        {state.emailed ? (
          <p className="mx-auto mt-3 max-w-sm text-[#0f2f3c]/70">
            We&apos;ve sent a welcome email to <strong className="text-[#0f2f3c]">{state.email}</strong>. Press the
            button in it to set your password and you&apos;re in. Your free trial runs until the end of{" "}
            <strong className="text-[#0f2f3c]">{state.endsOn}</strong>.
          </p>
        ) : (
          <p className="mx-auto mt-3 max-w-sm text-[#0f2f3c]/70">
            Your company is set up, but we couldn&apos;t send your welcome email just now. One of us will be in touch
            within one working day to get you in. Your free trial runs until the end of{" "}
            <strong className="text-[#0f2f3c]">{state.endsOn}</strong>.
          </p>
        )}
        {state.emailed && (
          <p className="mx-auto mt-3 max-w-sm text-sm text-[#0f2f3c]/60">
            Not there after a few minutes? Check your junk folder, or give us a ring.
          </p>
        )}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {state.booking && !booking && (
            <button
              type="button"
              onClick={() => setBooking(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#134f63] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d6f8a]"
            >
              <CalendarDays className="size-4" /> Book a demo
            </button>
          )}
          <a
            href="tel:+441616944701"
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              state.booking
                ? "border border-[#134f63]/20 text-[#134f63] hover:bg-[#134f63]/5"
                : "bg-[#134f63] text-white hover:bg-[#1d6f8a]"
            }`}
          >
            <Phone className="size-4" /> 0161 694 4701
          </a>
          <Link
            href="/training"
            className="inline-flex items-center gap-2 rounded-full border border-[#134f63]/20 px-5 py-2.5 text-sm font-semibold text-[#134f63] transition hover:bg-[#134f63]/5"
          >
            See the courses <ArrowRight className="size-4" />
          </Link>
        </div>
        {state.booking && booking && (
          <div className="mt-6">
            <DemoBookingForm orgId={state.booking.orgId} email={state.email ?? ""} phone={state.booking.phone} />
          </div>
        )}
      </div>
    );
  }

  const v: Partial<TrialSignupValues> = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#134f63]/10 sm:p-8">
      {state.error && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="alert"
          className="mb-6 rounded-2xl border border-[#b42318]/25 bg-[#b42318]/6 p-4 text-sm text-[#7a2012] outline-none"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-5" noValidate>
        {/* Honeypot — hidden from people, irresistible to bots. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="orgName" className={labelClass}>
            Your company
          </label>
          <input
            id="orgName"
            name="orgName"
            type="text"
            autoComplete="organization"
            required
            defaultValue={v.orgName ?? ""}
            aria-invalid={errors.orgName ? true : undefined}
            aria-describedby={errors.orgName ? "orgName-error" : undefined}
            className={`mt-1.5 ${field}`}
            placeholder="Hargreaves Home Care"
          />
          <FieldError id="orgName-error">{errors.orgName}</FieldError>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className={labelClass}>
              Your name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              defaultValue={v.name ?? ""}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "name-error" : undefined}
              className={`mt-1.5 ${field}`}
              placeholder="Jane Hargreaves"
            />
            <FieldError id="name-error">{errors.name}</FieldError>
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Your email <span className={hintClass}>(you&apos;ll sign in with it)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={v.email ?? ""}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={`mt-1.5 ${field}`}
              placeholder="jane@yourcareservice.co.uk"
            />
            <FieldError id="email-error">{errors.email}</FieldError>
          </div>

          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone <span className={hintClass}>(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={v.phone ?? ""}
              className={`mt-1.5 ${field}`}
              placeholder="0161 000 0000"
            />
          </div>

          <div>
            <label htmlFor="serviceType" className={labelClass}>
              Kind of service
            </label>
            <select
              id="serviceType"
              name="serviceType"
              key={`service-${v.serviceType ?? ""}`}
              defaultValue={v.serviceType ?? ""}
              aria-invalid={errors.serviceType ? true : undefined}
              aria-describedby={errors.serviceType ? "serviceType-error" : undefined}
              className={`mt-1.5 ${select}`}
            >
              <option value="" disabled>
                Choose one
              </option>
              {SERVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <FieldError id="serviceType-error">{errors.serviceType}</FieldError>
          </div>
        </div>

        <div>
          <label htmlFor="sizeBand" className={labelClass}>
            How many staff?
          </label>
          <select
            id="sizeBand"
            name="sizeBand"
            key={`size-${v.sizeBand ?? ""}`}
            defaultValue={v.sizeBand ?? ""}
            aria-invalid={errors.sizeBand ? true : undefined}
            aria-describedby={errors.sizeBand ? "sizeBand-error" : undefined}
            className={`mt-1.5 ${select}`}
          >
            <option value="" disabled>
              Choose one
            </option>
            {SIZE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <FieldError id="sizeBand-error">{errors.sizeBand}</FieldError>
        </div>

        <div>
          <label className="flex items-start gap-3 text-sm text-[#0f2f3c]/80">
            <input
              type="checkbox"
              name="agree"
              defaultChecked={v.agree ?? false}
              aria-invalid={errors.agree ? true : undefined}
              aria-describedby={errors.agree ? "agree-error" : undefined}
              className="mt-0.5 size-4 shrink-0 accent-[#134f63]"
            />
            <span>
              I&apos;m signing up a care provider for a 30-day free trial, and I&apos;ve read the{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-[#134f63]">
                privacy policy
              </Link>
              . No card, nothing to pay, and nothing carries on unless we choose a package.
            </span>
          </label>
          <FieldError id="agree-error">{errors.agree}</FieldError>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#134f63] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1d6f8a] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Setting you up…
            </>
          ) : (
            <>
              Start my free trial <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
