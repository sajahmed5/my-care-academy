"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/walkthrough";
import { setGettingStartedHidden } from "./actions";
import { REPLAY_TOUR_EVENT } from "./walkthrough";

/**
 * The Getting started list on Today for a company on a trial (board 4 of
 * the mock-ups): the Finish setting up card grown up. Seven things to try,
 * each ticked off from real data, with the route in plain English and a
 * Show me that opens the page and points at the button (?show=<task>).
 */
export function GettingStarted({ tasks }: { tasks: Task[] }) {
  const [pending, start] = useTransition();
  const done = tasks.filter((t) => t.done).length;
  return (
    <section aria-labelledby="getting-started-heading" data-tour="getting-started" className={cn("rounded-card border bg-card p-5 sm:p-6", pending && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="getting-started-heading" className="text-lg font-extrabold tracking-tight">
          Getting started
        </h2>
        <span className="text-sm font-semibold text-muted-foreground">
          {done} of {tasks.length} done
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {tasks.length === 7 ? "Seven" : tasks.length === 6 ? "Six" : tasks.length === 5 ? "Five" : tasks.length} things to try this week. Each ticks itself off when it&apos;s done;{" "}
        <b className="font-bold text-foreground">Show me</b> opens the right page and points at the button.
      </p>
      <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        <div className="h-full rounded-full bg-chart-2 transition-[width]" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
      </div>

      <ol className="mt-3.5 divide-y">
        {tasks.map((t) => (
          <li key={t.key} className="flex items-start gap-3 py-3">
            {t.done ? (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span className="mt-0.5 size-6 shrink-0 rounded-full border-2 border-border" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[15px] font-bold leading-snug", t.done && "text-muted-foreground line-through decoration-muted-foreground/60")}>{t.title}</span>
              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{t.detail}</span>
            </span>
            {!t.done && (
              <Link
                href={t.href}
                aria-label={`Show me: ${t.title}`}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border bg-background px-2.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent"
              >
                Show me
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-1 flex items-center justify-between border-t pt-3.5 text-sm">
        <button type="button" onClick={() => window.dispatchEvent(new Event(REPLAY_TOUR_EVENT))} className="font-bold text-primary hover:underline">
          Replay the tour
        </button>
        {/* Per person, and Help brings it back. */}
        <button type="button" disabled={pending} onClick={() => start(() => setGettingStartedHidden(true))} className="text-muted-foreground hover:text-foreground hover:underline">
          Hide for now
        </button>
      </div>
    </section>
  );
}
