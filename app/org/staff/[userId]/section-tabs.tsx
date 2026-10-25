import Link from "next/link";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { SECTIONS, sectionState, type SectionDef } from "./sections";
import type { FeatureKey } from "@/lib/features";

/**
 * The tab row across a carer's file.
 *
 * Links rather than client-side tabs, so a section is addressable: the
 * evidence pack, a reminder email and "3 actions outstanding" elsewhere in the
 * app all need to land on one. It also means a tab's data is only fetched when
 * that tab is open, which matters on a file with four years of history.
 *
 * On a phone the row used to scroll sideways, hiding most sections off the
 * edge. There the sections stack instead, as an accordion (CARER-FILE.md §2):
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
  const at = SECTIONS.findIndex((s) => s.key === active);
  return (
    <>
      <div className="-mx-1 hidden overflow-x-auto px-1 sm:block">
        <nav
          aria-label="Sections of this file"
          className="flex min-w-max items-center gap-1 border-b"
        >
          {SECTIONS.map((section) => {
            const state = sectionState(section, enabled);
            const isActive = section.key === active;
            return (
              <Link
                key={section.key}
                href={`/org/staff/${userId}?section=${section.key}`}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <StateMarks section={section} enabled={enabled} />
                {section.label}
                {state === "planned" && <span className="sr-only"> (coming soon)</span>}
                {state === "locked" && <span className="sr-only"> (not in your plan)</span>}
              </Link>
            );
          })}
        </nav>
      </div>
      <StackedRows
        userId={userId}
        active={active}
        enabled={enabled}
        sections={SECTIONS.slice(0, at < 0 ? SECTIONS.length : at + 1)}
      />
    </>
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
  const at = SECTIONS.findIndex((s) => s.key === active);
  if (at < 0) return null;
  return (
    <StackedRows
      userId={userId}
      active={active}
      enabled={enabled}
      sections={SECTIONS.slice(at + 1)}
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
    <nav aria-label={label} className="divide-y overflow-hidden rounded-lg border sm:hidden">
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

function StateMarks({ section, enabled }: { section: SectionDef; enabled: Record<FeatureKey, boolean> }) {
  return sectionState(section, enabled) !== "open" ? <Lock className="size-3.5 shrink-0" aria-hidden /> : null;
}
