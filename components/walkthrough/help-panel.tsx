"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, CircleHelp, ListChecks, MessageCircle, Play, X } from "lucide-react";
import { IntentLink } from "@/components/intent-link";
import { CodeTile } from "@/components/code-tile";
import { cn } from "@/lib/utils";
import type { HowTo } from "@/lib/walkthrough";
import { usePhoneLayout } from "./coach";
import { REPLAY_TOUR_EVENT } from "./walkthrough";
import { setGettingStartedHidden } from "./actions";

/** The phone menu's "Help and tour" line opens the panel with this. */
export const OPEN_HELP_EVENT = "mca:open-help";

/**
 * Help in the bar (board 5 of the mock-ups): a ? beside the bell, for
 * console roles only. "How do I…" opens the page and points at the button
 * (?show=<key>); the tour can be replayed from any page; Talk to us goes to
 * the contact form; on a trial the end date is spelled out, and the Getting
 * started list can be brought back once hidden.
 */
export function HelpPanel({
  howTos,
  trialEndsOn,
  listHidden,
}: {
  howTos: HowTo[];
  /** "Monday 9 November" while the company is on a trial, else null. */
  trialEndsOn: string | null;
  /** The person hid the Getting started list; offer it back. */
  listHidden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const phone = usePhoneLayout();
  const pathname = usePathname();
  const router = useRouter();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_HELP_EVENT, show);
    return () => window.removeEventListener(OPEN_HELP_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function replay() {
    setOpen(false);
    // The tour lives on Today; from anywhere else, go there first.
    if (pathname === "/org") window.dispatchEvent(new Event(REPLAY_TOUR_EVENT));
    else router.push("/org?tour=1");
  }

  function showList() {
    start(async () => {
      await setGettingStartedHidden(false);
      setOpen(false);
      router.push("/org");
    });
  }

  const footerLink = "flex min-h-11 items-center gap-2.5 text-[15px] font-bold text-primary hover:underline";

  const panel = open && (
    <div
      className={cn(
        "z-50 overflow-hidden bg-popover text-popover-foreground shadow-2xl",
        phone ? "fixed inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-[22px] border-t" : "absolute right-0 top-full mt-2 w-[400px] rounded-card border",
      )}
      role="dialog"
      aria-label="Help"
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
        <div>
          <h3 className="text-lg font-extrabold tracking-tight">How do I…</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Short answers that open the page and point at the button.</p>
        </div>
        {phone && (
          <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="-mr-2 inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted">
            <X className="size-5" />
          </button>
        )}
      </div>
      <ul className="px-2 pb-2">
        {howTos.map((h) => (
          <li key={h.key}>
            <IntentLink href={h.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted">
              <CodeTile code={h.code} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-tight">{h.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{h.route}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </IntentLink>
          </li>
        ))}
      </ul>
      <div className="flex flex-col border-t bg-muted/50 px-5 py-3 sm:px-6">
        <button type="button" onClick={replay} className={footerLink}>
          <Play className="size-[18px]" aria-hidden />
          Replay the two-minute tour
        </button>
        {listHidden && (
          <button type="button" onClick={showList} disabled={pending} className={cn(footerLink, pending && "opacity-60")}>
            <ListChecks className="size-[18px]" aria-hidden />
            Show the Getting started list again
          </button>
        )}
        <IntentLink href="/contact" onClick={() => setOpen(false)} className={footerLink}>
          <MessageCircle className="size-[18px]" aria-hidden />
          Talk to us: we&apos;ll set it up with you
        </IntentLink>
        {trialEndsOn && (
          <p className="pb-1.5 pt-1 text-[13px] text-muted-foreground">
            Your trial ends {trialEndsOn}. Choose a plan any time.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Help and tour"
        data-tour="nav-help"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "hidden size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted nav:inline-flex",
          open && "bg-accent text-accent-foreground",
        )}
      >
        <CircleHelp className="size-[22px]" />
      </button>
      {phone && open && <div className="fixed inset-0 z-40 bg-[rgba(19,48,46,0.5)]" aria-hidden onMouseDown={() => setOpen(false)} />}
      {panel}
    </div>
  );
}
