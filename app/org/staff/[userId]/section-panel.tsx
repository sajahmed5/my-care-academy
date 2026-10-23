import Link from "next/link";
import { ArrowRight, Clock3, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SectionDef, SectionState } from "./sections";

/**
 * A section that is not rendering its own data: locked behind a package,
 * planned, or built somewhere else and linked to from here.
 *
 * This component is handed a definition and a state — never rows. That is the
 * point rather than a convenience: an organisation that downgrades still has
 * supervisions in the table, and a panel that fetched them to grey them out
 * would be a way to read data they have stopped paying for. The lock is in the
 * page's query, and this is only what the lock looks like.
 */
export function SectionPanel({
  section,
  state,
  href,
}: {
  section: SectionDef;
  state: SectionState;
  href?: string;
}) {
  if (state === "locked") {
    return (
      <Shell icon={<Lock className="size-4" aria-hidden />} title={section.label}>
        <p className="text-sm text-muted-foreground">{section.blurb}</p>
        <p className="text-sm">
          Not included in your plan.{" "}
          <Link href="/org/billing" className="font-medium text-primary hover:underline">
            See what each plan includes
          </Link>
          .
        </p>
      </Shell>
    );
  }

  if (state === "planned") {
    return (
      <Shell icon={<Clock3 className="size-4" aria-hidden />} title={section.label}>
        <p className="text-sm text-muted-foreground">{section.blurb}</p>
        <p className="text-sm text-muted-foreground">
          Coming soon — it will appear here, in this file.
        </p>
      </Shell>
    );
  }

  // Open, but the area itself lives elsewhere for now.
  return (
    <Shell title={section.label}>
      <p className="text-sm text-muted-foreground">{section.blurb}</p>
      {href && (
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0"
        >
          {section.hrefLabel ?? "Open"}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </Shell>
  );
}

function Shell({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          {icon}
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}
