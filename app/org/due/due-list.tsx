import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DUE_GROUP_LABEL, DUE_ORDER, type DueRow, type DueRowStatus } from "@/lib/due-view";
import { formatDate } from "@/lib/dates";

const CHIP: Record<DueRowStatus, string> = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  never: "bg-rose-50 text-rose-700",
  none: "bg-muted text-muted-foreground",
  scheduled: "bg-muted text-muted-foreground",
};

const fmt = (d: string | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * Every current carer, grouped by where their next review stands, each a link
 * into the right section of their file — where the review is recorded.
 */
export function DueList({ rows, section, noun }: { rows: DueRow[]; section: string; noun: string }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No current staff.</CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {DUE_ORDER.map((s) => {
          const n = rows.filter((r) => r.status === s).length;
          if (!n) return null;
          return (
            <a key={s} href={`#${s}`} className={`rounded-full px-3 py-1 text-sm ${CHIP[s]}`}>
              {DUE_GROUP_LABEL[s]} · {n}
            </a>
          );
        })}
      </div>
      {DUE_ORDER.map((s) => {
        const group = rows.filter((r) => r.status === s);
        if (!group.length) return null;
        return (
          <section key={s} id={s} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {DUE_GROUP_LABEL[s]} ({group.length})
            </h3>
            <Card>
              <CardContent className="divide-y p-0">
                {group.map((r) => (
                  <Link
                    key={r.person.id}
                    href={`/org/staff/${r.person.id}?section=${section}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium text-primary">{r.person.name}</span>
                    <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Last {noun}: {fmt(r.last)}</span>
                      {r.booked && (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800">Booked {fmt(r.booked)}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 font-medium ${CHIP[r.status]}`}>
                        {r.status === "never" ? "None on file" : r.next ? `Next ${fmt(r.next)}` : "No date set"}
                      </span>
                      {/* The whole row opens the carer's file; say so. */}
                      <ChevronRight className="size-4" aria-hidden />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
