import Link from "next/link";

/**
 * Pages within one section of the file (the documents page's Recruitment
 * sub-page, HR-PACK.md), as links so each is addressable.
 */
export function SubTabs({ base, active, tabs }: { base: string; active: string; tabs: { key: string; label: string }[] }) {
  return (
    <nav aria-label="Pages in this section" className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key || "main"}
            href={t.key ? `${base}&sub=${t.key}` : base}
            aria-current={on ? "page" : undefined}
            className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm ${
              on ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
