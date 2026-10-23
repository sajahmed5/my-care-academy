import Link from "next/link";
import { Lock } from "lucide-react";
import { SECTIONS, sectionState } from "./sections";
import type { FeatureKey } from "@/lib/features";

/**
 * The tab row across a carer's file.
 *
 * Links rather than client-side tabs, so a section is addressable: the
 * evidence pack, a reminder email and "3 actions outstanding" elsewhere in the
 * app all need to land on one. It also means a tab's data is only fetched when
 * that tab is open, which matters on a file with four years of history.
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
  return (
    <div className="-mx-1 overflow-x-auto px-1">
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
              {state !== "open" && (
                <Lock className="size-3.5 shrink-0" aria-hidden />
              )}
              {section.label}
              {state === "planned" && (
                <span className="sr-only"> (coming soon)</span>
              )}
              {state === "locked" && (
                <span className="sr-only"> (not in your plan)</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
