"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Pill } from "@/components/pill";
import { TRIAL_DAYS, daysLeftLabel } from "@/lib/trial";

/**
 * The welcome card over the dimmed Today page, the first time a manager or
 * office worker signs in during the trial (board 1 of the mock-ups).
 */
export function Welcome({
  firstName,
  orgName,
  daysLeft,
  endsOn,
  onTour,
  onSkip,
}: {
  firstName: string | null;
  orgName: string | null;
  daysLeft: number;
  /** "Friday" or "Monday 9 November": the day the trial ends. */
  endsOn: string;
  onTour: () => void;
  onSkip: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip]);

  // A trial that has only just started reads as a fresh start; a manager
  // added part-way through reads what is left.
  const pill = daysLeft >= TRIAL_DAYS - 1 ? `Your ${TRIAL_DAYS}-day trial has started` : `Trial · ${daysLeftLabel(daysLeft)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(19,48,46,0.62)] p-4 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className="w-full max-w-[560px] rounded-card bg-card p-6 text-card-foreground shadow-[0_30px_80px_rgba(0,0,0,.35)] outline-none sm:p-10"
      >
        <Pill tone="ok">{pill}</Pill>
        <h1 id="welcome-title" className="mt-3.5 text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]">
          Welcome to My Care Academy{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          You have everything in Enterprise for {TRIAL_DAYS} days. Take a two-minute tour of where things are, then work through a short list of things to try, so by {endsOn} you&apos;ll know whether it fits
          {orgName ? ` ${orgName}` : " your service"}.
        </p>
        <ul className="mt-4 grid gap-2.5 text-[15px]">
          {["Seven quick stops: Today, Due, People, Training, Compliance, + New and Search, and you", "Then a Getting started list that ticks itself off as you go"].map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3.5} />
              </span>
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onTour}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Take the tour
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex h-11 items-center rounded-xl border bg-background px-4 text-[15px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            Skip, I&apos;ll explore
          </button>
          <span className="ml-auto text-[13px] text-muted-foreground">Replay it any time from Help</span>
        </div>
      </div>
    </div>
  );
}
