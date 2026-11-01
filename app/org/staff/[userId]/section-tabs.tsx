"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTIONS, sectionState, type SectionDef } from "./sections";
import type { FeatureKey } from "@/lib/features";

/** What is outstanding in a section, shown beside it on the tab. */
export interface SectionCount {
  text: string;
  tone: "danger" | "warn" | "muted";
}

const TONE: Record<SectionCount["tone"], string> = {
  danger: "bg-danger text-danger-foreground",
  warn: "bg-warn text-warn-foreground",
  muted: "bg-muted text-muted-foreground",
};

/**
 * The sections of a person's file as a row of tabs under the header card
 * (docs/redesign image 4): Overview, Training, Certificates, Care
 * Certificate, Supervisions, Spot checks, Documents, Employment, and More
 * for the four used less often. Links rather than client-side tabs, so a
 * section is addressable: the evidence pack, a reminder email and "3
 * actions outstanding" elsewhere in the app all land on one. Sections the
 * package leaves out are not listed, unless it is the one open — a link
 * straight to it still says it isn't in the package. On a phone the row
 * scrolls sideways, the open tab brought into view.
 */
export function ProfileTabs({
  userId,
  active,
  enabled,
  counts = {},
}: {
  userId: string;
  active: string;
  enabled: Record<FeatureKey, boolean>;
  counts?: Record<string, SectionCount>;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const search = useSearchParams();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMoreOpen(false), [pathname, search]);

  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    const row = rowRef.current;
    const link = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && link) row.scrollLeft = link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2;
  }, [active]);

  const shown = SECTIONS.filter((s) => s.key === active || sectionState(s, enabled) !== "locked");
  const main = shown.filter((s) => !s.more);
  const more = shown.filter((s) => s.more);
  const activeInMore = more.find((s) => s.key === active);
  const href = (s: SectionDef) => `/org/staff/${userId}?section=${s.key}`;

  const tab = (s: SectionDef, isActive: boolean) => {
    const state = sectionState(s, enabled);
    const count = counts[s.key];
    return (
      <>
        {state !== "open" && <Lock className="size-3.5 shrink-0" aria-hidden />}
        {s.label}
        {state === "planned" && <span className="sr-only"> (coming soon)</span>}
        {state === "locked" && <span className="sr-only"> (not in your plan)</span>}
        {count && state === "open" && (
          <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none", isActive ? TONE[count.tone] : TONE[count.tone])}>{count.text}</span>
        )}
      </>
    );
  };

  const tabClass = (isActive: boolean) =>
    cn(
      "inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[15px] transition-colors",
      isActive ? "border-primary font-bold text-primary" : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
    );

  return (
    <nav aria-label="Sections of this file" className="relative border-t">
      <div ref={rowRef} className="flex min-w-0 gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden">
        {main.map((s) => {
          const isActive = s.key === active;
          return (
            <Link key={s.key} href={href(s)} aria-current={isActive ? "page" : undefined} className={tabClass(isActive)}>
              {tab(s, isActive)}
            </Link>
          );
        })}
        {more.length > 0 && (
          <div ref={moreRef} className="relative shrink-0">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={() => setMoreOpen((o) => !o)}
              className={tabClass(!!activeInMore)}
            >
              {activeInMore ? activeInMore.label : "More"}
              <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
            </button>
            {moreOpen && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-60 rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl">
                {more.map((s) => {
                  const isActive = s.key === active;
                  return (
                    <Link
                      key={s.key}
                      role="menuitem"
                      href={href(s)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm",
                        isActive ? "bg-accent font-bold text-accent-foreground" : "font-medium hover:bg-muted",
                      )}
                    >
                      {tab(s, isActive)}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
