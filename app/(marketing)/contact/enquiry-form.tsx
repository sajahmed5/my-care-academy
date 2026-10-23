"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Phone } from "lucide-react";
import { submitEnquiryAction } from "./actions";
import { INITIAL_ENQUIRY_STATE, type EnquiryValues } from "./enquiry";
import { TEAM_SIZES, TOPICS, TOPIC_KEYS, type EnquiryTopic } from "./topics";

const field =
  "w-full rounded-xl border border-[#134f63]/15 bg-white px-4 py-3 text-sm text-[#0f2f3c] outline-none transition placeholder:text-[#0f2f3c]/35 focus:border-[#3a9fc4] focus:ring-4 focus:ring-[#3a9fc4]/15";
const labelClass = "block text-sm font-semibold text-[#0f2f3c]";
const hintClass = "text-xs font-normal text-[#0f2f3c]/50";

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-[#b42318]">
      {children}
    </p>
  );
}

/**
 * The website enquiry form: demo requests and "tell me more" in one place.
 *
 * `topic` and `message` arrive pre-filled from whichever CTA the visitor
 * pressed (/contact?topic=mock-inspection), so the thing they clicked is
 * already selected when the page opens.
 */
export function EnquiryForm({
  initialTopic,
  initialMessage = "",
}: {
  initialTopic: EnquiryTopic;
  initialMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitEnquiryAction,
    INITIAL_ENQUIRY_STATE,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const pagePathRef = useRef<HTMLInputElement>(null);

  // Which of our own pages they came from — useful context in the enquiry, and
  // never anything from another site. Written straight onto the hidden input
  // rather than held in state: the server doesn't know the referrer, so
  // rendering it as a value would differ between the server and the browser.
  useEffect(() => {
    try {
      const ref = document.referrer;
      if (ref && new URL(ref).origin === window.location.origin && pagePathRef.current) {
        pagePathRef.current.value = new URL(ref).pathname;
      }
    } catch {
      // No referrer, or one we can't parse — the field simply stays empty.
    }
  }, []);

  // Move focus to the outcome so it is announced rather than silently swapped
  // in below the fold.
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
          <CheckCircle2 className="size-6" />
        </span>
        <h2 className="font-display mt-5 text-2xl font-semibold text-[#0f2f3c]">
          Thanks — we&apos;ve got it
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[#0f2f3c]/65">
          We&apos;ve sent a copy to your inbox and one of us will come back to you
          within one working day. If it&apos;s urgent, give us a ring.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href="tel:+441616944701"
            className="inline-flex items-center gap-2 rounded-full bg-[#134f63] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d6f8a]"
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
      </div>
    );
  }

  const v: Partial<EnquiryValues> = state.values ?? {};
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
        {/* Context for the inbox, not the visitor. */}
        <input ref={pagePathRef} type="hidden" name="pagePath" defaultValue="" />
        {/* Honeypot — hidden from people, irresistible to bots. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="topic" className={labelClass}>
            What can we help with?
          </label>
          <select
            id="topic"
            name="topic"
            key={`topic-${v.topic ?? initialTopic}`}
            defaultValue={v.topic ?? initialTopic}
            className={`${field} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%230f2f3c" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>')] bg-[length:18px] bg-[right_1rem_center] bg-no-repeat pr-11`}
          >
            {TOPIC_KEYS.map((key) => (
              <option key={key} value={key}>
                {TOPICS[key]}
              </option>
            ))}
          </select>
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
              Work email
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
            <label htmlFor="organisation" className={labelClass}>
              Care service <span className={hintClass}>(optional)</span>
            </label>
            <input
              id="organisation"
              name="organisation"
              type="text"
              autoComplete="organization"
              defaultValue={v.organisation ?? ""}
              className={`mt-1.5 ${field}`}
              placeholder="Hargreaves Home Care"
            />
          </div>
        </div>

        <div>
          <label htmlFor="teamSize" className={labelClass}>
            How many staff? <span className={hintClass}>(optional)</span>
          </label>
          <select
            id="teamSize"
            name="teamSize"
            key={`size-${v.teamSize ?? ""}`}
            defaultValue={v.teamSize ?? ""}
            className={`mt-1.5 ${field} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%230f2f3c" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>')] bg-[length:18px] bg-[right_1rem_center] bg-no-repeat pr-11`}
          >
            <option value="">Rather not say</option>
            {TEAM_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="message" className={labelClass}>
            Anything else? <span className={hintClass}>(optional)</span>
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            defaultValue={v.message ?? initialMessage}
            className={`mt-1.5 ${field} resize-y`}
            placeholder="Tell us what you're looking for, or when suits for a call."
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#134f63] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1d6f8a] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Sending…
            </>
          ) : (
            <>
              Send enquiry <ArrowRight className="size-4" />
            </>
          )}
        </button>

        <p className="text-xs text-[#0f2f3c]/55">
          We&apos;ll only use your details to answer your enquiry — see our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-[#134f63]">
            privacy policy
          </Link>
          . No newsletter, no passing your details on.
        </p>
      </form>
    </div>
  );
}
