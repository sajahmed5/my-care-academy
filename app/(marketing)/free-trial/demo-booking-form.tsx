"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarCheck, CalendarDays, Loader2 } from "lucide-react";
import { DEMO_MINUTES, type DemoDay } from "@/lib/demo-booking";
import { bookDemoAction, loadDemoSlotsAction } from "./actions";
import { INITIAL_DEMO_BOOKING_STATE } from "./signup";

/**
 * Book a demo, on the success screen after signing up: a day from the next
 * two working weeks, then a time, then one button. The days and times come
 * from the server when it opens, so what's shown is what's free.
 */
export function DemoBookingForm({
  orgId,
  email,
  phone,
}: {
  orgId: string;
  email: string;
  phone: string | null;
}) {
  const [days, setDays] = useState<DemoDay[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [day, setDay] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [state, formAction, pending] = useActionState(bookDemoAction, INITIAL_DEMO_BOOKING_STATE);

  useEffect(() => {
    startLoading(async () => {
      const list = await loadDemoSlotsAction();
      setDays(list);
      setDay(list.find((d) => d.slots.length > 0)?.day ?? list[0]?.day ?? "");
    });
  }, []);

  // A time taken between the list and the press: fetch the list again so
  // the one they pressed is gone.
  useEffect(() => {
    if (state.status !== "error" || !/taken|on offer/.test(state.error ?? "")) return;
    startLoading(async () => {
      setDays(await loadDemoSlotsAction());
      setStartsAt("");
    });
  }, [state]);

  if (state.status === "booked") {
    return (
      <div className="rounded-2xl bg-[#059669]/8 p-5 text-left ring-1 ring-[#059669]/20">
        <p className="flex items-center gap-2 font-semibold text-[#0f2f3c]">
          <CalendarCheck className="size-5 text-[#059669]" /> Your demo is booked in
        </p>
        <p className="mt-2 text-sm text-[#0f2f3c]/75">
          <strong className="text-[#0f2f3c]">{state.when}</strong>, UK time, about {DEMO_MINUTES} minutes. We&apos;ve
          emailed you the time, and we&apos;ll confirm with how we&apos;ll call you.
        </p>
      </div>
    );
  }

  const chosen = days?.find((d) => d.day === day);

  return (
    <form action={formAction} className="rounded-2xl bg-[#eef6fa] p-5 text-left">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="phone" value={phone ?? ""} />
      <input type="hidden" name="startsAt" value={startsAt} />

      <p className="flex items-center gap-2 font-semibold text-[#0f2f3c]">
        <CalendarDays className="size-5 text-[#3a9fc4]" /> Book a {DEMO_MINUTES}-minute demo
      </p>
      <p className="mt-1 text-sm text-[#0f2f3c]/70">
        Pick a day and a time that suits you (UK time). One of us will walk you through it on a call.
      </p>

      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded-xl border border-[#b42318]/25 bg-white p-3 text-sm text-[#7a2012]">
          {state.error}
        </p>
      )}

      {days === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[#0f2f3c]/70">
          <Loader2 className="size-4 animate-spin" /> Finding the next free times…
        </p>
      ) : days.length === 0 ? (
        <p className="mt-4 text-sm text-[#0f2f3c]/70">
          Nothing to book just now. Ring us on 0161 694 4701 and we&apos;ll sort a time.
        </p>
      ) : (
        <>
          <label htmlFor="demo-day" className="mt-4 block text-sm font-semibold text-[#0f2f3c]">
            Day
          </label>
          <select
            id="demo-day"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setStartsAt("");
            }}
            className="mt-1.5 w-full rounded-xl border border-[#134f63]/15 bg-white px-4 py-3 text-sm text-[#0f2f3c] outline-none transition focus:border-[#3a9fc4] focus:ring-4 focus:ring-[#3a9fc4]/15"
          >
            {days.map((d) => (
              <option key={d.day} value={d.day} disabled={d.slots.length === 0}>
                {d.label}
                {d.slots.length === 0 ? " — full" : ""}
              </option>
            ))}
          </select>

          <p className="mt-4 text-sm font-semibold text-[#0f2f3c]">Time</p>
          {chosen && chosen.slots.length > 0 ? (
            <div role="radiogroup" aria-label="Time" className="mt-1.5 flex flex-wrap gap-2">
              {chosen.slots.map((s) => {
                const on = s.startsAt === startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStartsAt(s.startsAt)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      on
                        ? "bg-[#134f63] text-white"
                        : "bg-white text-[#0f2f3c] ring-1 ring-[#134f63]/15 hover:bg-[#134f63]/5"
                    }`}
                  >
                    {s.time}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-[#0f2f3c]/60">No times left that day. Pick another.</p>
          )}

          <button
            type="submit"
            disabled={pending || loading || !startsAt}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#134f63] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d6f8a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Booking…
              </>
            ) : (
              <>
                <CalendarCheck className="size-4" /> Book this demo
              </>
            )}
          </button>
        </>
      )}
    </form>
  );
}
