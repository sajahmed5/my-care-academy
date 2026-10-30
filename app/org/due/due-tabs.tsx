import Link from "next/link";
import type { UserContext } from "@/lib/auth";
import { enabledMap } from "@/lib/entitlements";
import type { FeatureKey } from "@/lib/features";

/**
 * Who's due (ease-of-use review, 30 Oct 2026): what used to be eight
 * separate "…due" pages under four menus is one page, a tab for each kind,
 * so a manager sees everything falling due from one place. Each tab keeps its
 * own address, so saved links and the weekly email's still work.
 */
export const DUE_TABS: { href: string; label: string; feature: FeatureKey }[] = [
  { href: "/org/due/supervisions", label: "Supervisions", feature: "people.supervisions" },
  { href: "/org/due/appraisals", label: "Appraisals", feature: "people.supervisions" },
  { href: "/org/due/spot-checks", label: "Spot checks", feature: "people.competency" },
  { href: "/org/due/competency", label: "Competency", feature: "people.competency" },
  { href: "/org/hr/documents", label: "Staff documents", feature: "recruitment.tracker" },
  { href: "/org/due/audits", label: "Service audits", feature: "quality.audits" },
  { href: "/org/due/policies", label: "Policies", feature: "documents.library" },
  { href: "/org/due/forms", label: "Form reviews", feature: "forms.builder" },
];

/** The tabs this company's package has, in order. */
export async function dueTabsFor(context: UserContext) {
  const enabled = await enabledMap(context);
  return DUE_TABS.filter((t) => enabled[t.feature]);
}

/** The row of tabs across the top of every Who's due page. */
export async function DueTabs({ context, active }: { context: UserContext; active: string }) {
  const tabs = await dueTabsFor(context);
  return (
    <nav aria-label="Who's due" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
      {tabs.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${
              on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
