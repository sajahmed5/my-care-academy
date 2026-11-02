import Link from "next/link";
import type { Latest } from "@/lib/latest";

/**
 * Under a long list: "Showing the most recent 200 of 1,240 · View all".
 * Renders nothing when the list is complete.
 */
export function ViewAll({ list, href, noun = "entries" }: { list: Pick<Latest<unknown>, "rows" | "total" | "cut">; href: string; noun?: string }) {
  if (!list.cut) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 px-1 py-3 text-sm text-muted-foreground">
      <span>
        Showing the most recent {list.rows.length.toLocaleString("en-GB")} of {list.total.toLocaleString("en-GB")} {noun}.
      </span>
      <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
        View all {list.total.toLocaleString("en-GB")}
      </Link>
    </p>
  );
}
