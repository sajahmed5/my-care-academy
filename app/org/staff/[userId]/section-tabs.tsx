import Link from "next/link";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { SECTIONS, sectionState, type SectionDef } from "./sections";
import type { FeatureKey } from "@/lib/features";

/** What is outstanding in a section, shown beside it on the list. */
export interface SectionCount {
  text: string;
  tone: "danger" | "warn" | "muted";
}

const TONE: Record<SectionCount["tone"], string> = {
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  muted: "text-muted-foreground",
};

/**
 * Every section of a carer's file, down the left beside it (md and up).
 *
 * Links rather than client-side tabs, so a section is addressable: the
 * evidence pack, a reminder email and "3 actions outstanding" elsewhere in the
 * app all need to land on one. It also means a section's data is only fetched
 * when it is open, which matters on a file with four years of history.
 *
 * It was a row of tabs across the top, which ran off the edge after the fifth
 * section, so it was not apparent the file had more than Training in it
 * (Saj, 27 Oct 2026). Sections the package leaves out are not listed (Saj,
 * 30 Oct 2026), unless it is the one open — a link straight to it still
 * says it isn't in the package.
 */
export function SectionRail({
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
  const shown = shownSections(enabled, active);
  const open = shown.filter((s) => sectionState(s, enabled) === "open");
  const shut = shown.filter((s) => sectionState(s, enabled) !== "open");
  return (
    <nav aria-label="Sections of this file" className="hidden rounded-xl border bg-card p-1.5 md:block">
      {[...open, ...shut].map((section) => {
        const state = sectionState(section, enabled);
        const isActive = section.key === active;
        const count = counts[section.key];
        return (
          <Link
            key={section.key}
            href={`/org/staff/${userId}?section=${section.key}`}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : state === "open"
                  ? "text-foreground/80 hover:bg-muted"
                  : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <StateMarks section={section} enabled={enabled} />
            <span className="flex-1">{section.label}</span>
            {state === "planned" && <span className="sr-only"> (coming soon)</span>}
            {state === "locked" && <span className="sr-only"> (not in your plan)</span>}
            {count && state === "open" && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TONE[count.tone]}`}>{count.text}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * On a phone the sections stack instead, as an accordion (CARER-FILE.md §2):
 * the sections down to the open one here, its content under it, and the rest
 * after the content, from SectionTabsAfter.
 */
export function SectionTabs({
  userId,
  active,
  enabled,
}: {
  userId: string;
  active: string;
  enabled: Record<FeatureKey, boolean>;
}) {
  const shown = shownSections(enabled, active);
  const at = shown.findIndex((s) => s.key === active);
  return (
    <StackedRows
      userId={userId}
      active={active}
      enabled={enabled}
      sections={shown.slice(0, at < 0 ? shown.length : at + 1)}
    />
  );
}

/** On a phone: the sections after the open one, under its content. */
export function SectionTabsAfter({
  userId,
  active,
  enabled,
}: {
  userId: string;
  active: string;
  enabled: Record<FeatureKey, boolean>;
}) {
  const shown = shownSections(enabled, active);
  const at = shown.findIndex((s) => s.key === active);
  if (at < 0) return null;
  return (
    <StackedRows
      userId={userId}
      active={active}
      enabled={enabled}
      sections={shown.slice(at + 1)}
      label="More sections of this file"
    />
  );
}

function StackedRows({
  userId,
  active,
  enabled,
  sections,
  label = "Sections of this file",
}: {
  userId: string;
  active: string;
  enabled: Record<FeatureKey, boolean>;
  sections: readonly SectionDef[];
  label?: string;
}) {
  if (sections.length === 0) return null;
  return (
    <nav aria-label={label} className="divide-y overflow-hidden rounded-lg border md:hidden">
      {sections.map((section) => {
        const isActive = section.key === active;
        const Chevron = isActive ? ChevronDown : ChevronRight;
        return (
          <Link
            key={section.key}
            href={`/org/staff/${userId}?section=${section.key}`}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-12 items-center gap-2 px-3 text-sm font-medium ${
              isActive ? "bg-muted text-foreground" : "text-muted-foreground"
            }`}
          >
            <StateMarks section={section} enabled={enabled} />
            <span className="flex-1">{section.label}</span>
            <Chevron className="size-4 shrink-0" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}

/** The sections to list: all but those the package leaves out, bar the open one. */
function shownSections(enabled: Record<FeatureKey, boolean>, active: string): SectionDef[] {
  return SECTIONS.filter((s) => s.key === active || sectionState(s, enabled) !== "locked");
}

function StateMarks({ section, enabled }: { section: SectionDef; enabled: Record<FeatureKey, boolean> }) {
  return sectionState(section, enabled) !== "open" ? <Lock className="size-3.5 shrink-0" aria-hidden /> : null;
}
