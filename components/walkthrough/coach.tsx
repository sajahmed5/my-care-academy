"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A coach mark (walkthrough mock-ups, 1 Nov 2026): the page dimmed, a teal
 * spotlight round the real element, and a dark card beside it with the
 * step's words and buttons. The tour shows seven in a row; "Show me" and
 * Help show one. On a phone (under the nav breakpoint) the card is a sheet
 * from the bottom of the screen, since nothing fits beside anything.
 *
 * The spotlight is measured from the live element with getBoundingClientRect
 * and redrawn on resize, scroll and any change to the page, so it follows a
 * drop-down as it opens and a list as it loads.
 */

/** Below 1,280px the bar is a hamburger (--breakpoint-nav in globals.css). */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279.98px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Elements marked with the attribute that are actually drawn (not display:none). */
export function findTargets(attr: string, targets: string[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const t of targets) {
    document.querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(t)}"]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) found.push(el);
    });
  }
  return found;
}

function unionBox(els: HTMLElement[]): Box | null {
  if (els.length === 0) return null;
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { top, left, width: right - left, height: bottom - top };
}

/** The box round the targets, in viewport coordinates, kept current. */
function useTargetBox(attr: string, targets: string[]): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const key = targets.join("|");
  const scrolled = useRef<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const els = findTargets(attr, targets);
      const next = unionBox(els);
      // Bring the element on screen once per step: the bar is sticky and
      // always in view, so only something further down the page (Today's
      // list) ever moves.
      if (next && scrolled.current !== key) {
        scrolled.current = key;
        const vh = window.innerHeight;
        if (next.top < 0 || next.top + next.height > vh - 24) {
          window.scrollTo({ top: Math.max(0, window.scrollY + next.top - 140), behavior: "smooth" });
        }
      }
      setBox((prev) =>
        prev && next && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
    };
    // Scroll and resize come in bursts, so they measure once a frame; a
    // change to the page (a drop-down opening for the step) measures at
    // once, so the spotlight moves the moment the panel is there.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const warm = [50, 150, 400].map((ms) => setTimeout(measure, ms));
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      warm.forEach(clearTimeout);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attr, key]);

  return box;
}

const PAD = 8;
const GAP = 16;
const MARGIN = 16;
const CARD_W = 400;

/** Where the card sits beside the spotlight: the first side it fits on. */
function place(box: Box, w: number, h: number, vw: number, vh: number): { top: number; left: number; side: "right" | "left" | "bottom" | "top" | "free" } {
  const r = { top: box.top - PAD, left: box.left - PAD, right: box.left + box.width + PAD, bottom: box.top + box.height + PAD };
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - h - MARGIN));
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - w - MARGIN));
  // Something in the bar wants the card under it; anything else, beside it.
  const order: ("right" | "bottom" | "left" | "top")[] = r.top < 120 ? ["bottom", "right", "left", "top"] : ["right", "bottom", "left", "top"];
  for (const side of order) {
    if (side === "right" && r.right + GAP + w <= vw - MARGIN) return { side, left: r.right + GAP, top: clampY(r.top) };
    if (side === "left" && r.left - GAP - w >= MARGIN) return { side, left: r.left - GAP - w, top: clampY(r.top) };
    if (side === "bottom" && r.bottom + GAP + h <= vh - MARGIN) return { side, top: r.bottom + GAP, left: clampX(r.left) };
    if (side === "top" && r.top - GAP - h >= MARGIN) return { side, top: r.top - GAP - h, left: clampX(r.left) };
  }
  return { side: "free", top: Math.max(MARGIN, vh - h - MARGIN), left: Math.max(MARGIN, vw - w - MARGIN) };
}

export interface CoachProps {
  /** data-tour for the tour, data-coach for a single mark. */
  attr?: "data-tour" | "data-coach";
  targets: string[];
  /** Over the title: "Step 1 of 7 · Today". */
  eyebrow?: string;
  title: string;
  body: string;
  primary: { label: string; onClick: () => void };
  /** Back, when there is a step to go back to. */
  secondary?: { label: string; onClick: () => void } | null;
  dots?: { count: number; index: number };
  /** The small link under the buttons: "Skip the tour", "Got it". */
  dismiss: { label: string; onClick: () => void };
}

export function Coach({ attr = "data-tour", targets, eyebrow, title, body, primary, secondary, dots, dismiss }: CoachProps) {
  const phone = usePhoneLayout();
  const box = useTargetBox(attr, targets);
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: CARD_W, h: 240 });
  const [viewport, setViewport] = useState({ vw: 1280, vh: 800 });

  useLayoutEffect(() => {
    const read = () => {
      setViewport({ vw: window.innerWidth, vh: window.innerHeight });
      const el = cardRef.current;
      if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [title, body, phone]);

  // Keys: Esc leaves, the arrows move, and focus starts on Next.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss.onClick();
      else if (e.key === "ArrowRight") primary.onClick();
      else if (e.key === "ArrowLeft" && secondary) secondary.onClick();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss, primary, secondary, title]);

  const pos = box && !phone ? place(box, size.w, size.h, viewport.vw, viewport.vh) : null;

  const dotsEl = dots && dots.count > 1 && (
    <span className="inline-flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: dots.count }, (_, i) => (
        <i key={i} className={cn("size-1.5 rounded-full", i === dots.index ? "bg-[#5eead4]" : "bg-white/30")} />
      ))}
    </span>
  );

  const buttons = (
    <>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className={cn("inline-flex h-11 items-center justify-center rounded-xl border border-white/30 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10", phone && "flex-1")}
        >
          {secondary.label}
        </button>
      )}
      <button
        type="button"
        onClick={primary.onClick}
        className={cn("inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover", phone && "flex-1")}
      >
        {primary.label}
      </button>
    </>
  );

  return (
    <>
      {/* Nothing under the card is clickable while it shows; Next, Back and
          Skip move the tour on. Scrolling still works. */}
      <div className="fixed inset-0 z-[60]" aria-hidden />
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[61] rounded-2xl transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 4px #5eead4, 0 0 0 9999px rgba(19, 48, 46, 0.62)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[61] bg-[rgba(19,48,46,0.62)]" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "fixed z-[62] bg-[#13302e] text-white shadow-[0_30px_70px_rgba(0,0,0,.45)] outline-none",
          phone ? "inset-x-0 bottom-0 rounded-t-[22px] px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5" : "w-[400px] max-w-[calc(100vw-32px)] rounded-card p-6",
        )}
        style={pos ? { top: pos.top, left: pos.left } : phone ? undefined : { visibility: "hidden" }}
      >
        {phone && <span aria-hidden className="mx-auto mb-3.5 block h-1 w-10 rounded-full bg-white/30" />}
        {pos && pos.side !== "free" && (
          <span
            aria-hidden
            className="absolute size-4 rotate-45 bg-[#13302e]"
            style={
              pos.side === "right"
                ? { left: -8, top: 28 }
                : pos.side === "left"
                  ? { right: -8, top: 28 }
                  : pos.side === "bottom"
                    ? { top: -8, left: Math.min(Math.max((box!.left + box!.width / 2) - pos.left - 8, 20), size.w - 36) }
                    : { bottom: -8, left: Math.min(Math.max((box!.left + box!.width / 2) - pos.left - 8, 20), size.w - 36) }
            }
          />
        )}
        {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-[#5eead4]">{eyebrow}</p>}
        <h3 className={cn("mt-1.5 font-extrabold leading-tight tracking-tight", phone ? "text-[19px]" : "text-xl")}>{title}</h3>
        <p className={cn("mt-2 leading-relaxed text-white/80", phone ? "text-sm" : "text-[15px]")}>{body}</p>
        {phone ? (
          <>
            <div className="mt-4 flex gap-2.5">{buttons}</div>
            <div className="mt-3.5 flex items-center justify-between">
              <button type="button" onClick={dismiss.onClick} className="text-[13px] text-white/60 hover:text-white">
                {dismiss.label}
              </button>
              {dotsEl}
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-2.5">
              {buttons}
              <span className="ml-auto">{dotsEl}</span>
            </div>
            <button type="button" onClick={dismiss.onClick} className="mt-3.5 text-[13px] text-white/60 hover:text-white">
              {dismiss.label}
            </button>
          </>
        )}
      </div>
    </>
  );
}
